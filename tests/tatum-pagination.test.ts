import test from 'node:test';
import assert from 'node:assert/strict';
import {createTatumSuiClient} from '../src/lib/tatum-rpc-client';
import {tatumPageSize} from '../src/lib/tatum-pagination';
import {SUI_MAINNET_USDC_TYPE,SUI_NATIVE_TYPE} from '../src/lib/config';
import type {SettlementCursor} from '../src/lib/memory-protocol';
const owner='0x'+'1'.repeat(64),id='0x'+'2'.repeat(64),digest='3'.repeat(44);
type Request={query:string;variables:Record<string,unknown>};
async function withGateway(work:(client:ReturnType<typeof createTatumSuiClient>,requests:Request[])=>Promise<void>,respond:(request:Request)=>unknown){
 const originalFetch=globalThis.fetch,originalKey=process.env.TATUM_API_KEY,requests:Request[]=[];
 process.env.TATUM_API_KEY='test-only-pagination-key';
 globalThis.fetch=(async(url,init)=>{
  assert.equal(url,'https://sui-mainnet.gateway.tatum.io/graphql');assert.equal(new Headers(init?.headers).get('x-api-key'),'test-only-pagination-key');
  const request=JSON.parse(String(init?.body)) as Request;requests.push(request);
  for(const key of ['first','last','limit'])if(request.variables[key]!==undefined)assert.ok(Number(request.variables[key])<=50,'oversized '+key);
  return Response.json(respond(request));
 }) as typeof fetch;
 try{await work(createTatumSuiClient(),requests);}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.TATUM_API_KEY;else process.env.TATUM_API_KEY=originalKey;}
}
test('page sizes cap oversized requests, keep small pages and reject malformed limits',()=>{
 assert.equal(tatumPageSize(100),50);assert.equal(tatumPageSize(7),7);assert.equal(tatumPageSize(),50);assert.equal(tatumPageSize(null),50);
 for(const limit of [0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>tatumPageSize(limit),/positive safe integer/);
});
test('real SDK coin queries cap both facade and Core requests and preserve continuation cursors',async()=>{
 await withGateway(async(client,requests)=>{
  const first=await client.getCoins({owner,coinType:SUI_MAINNET_USDC_TYPE,limit:100});
  assert.equal(first.data[0].coinObjectId,id);assert.equal(first.hasNextPage,true);assert.equal(first.nextCursor,'opaque-page-two');
  const second=await client.getCoins({owner,coinType:SUI_MAINNET_USDC_TYPE,limit:100,cursor:first.nextCursor});
  assert.equal(second.hasNextPage,false);assert.equal(second.data[0].balance,'6000000');
  await client.core.listCoins({owner,coinType:SUI_NATIVE_TYPE,limit:100}); // SDK gas resolution uses Core.
  await client.core.listCoins({owner,coinType:SUI_NATIVE_TYPE,limit:7});
  assert.deepEqual(requests.map(r=>r.variables.first),[50,50,50,7]);
  assert.equal(requests[1].variables.cursor,'opaque-page-two');
  assert.equal(requests[0].variables.type,'0x2::coin::Coin<'+SUI_MAINNET_USDC_TYPE+'>');
 },r=>({data:{address:{address:owner,objects:{nodes:[{address:id,version:1,digest,owner:{__typename:'AddressOwner',address:{address:owner}},contents:{type:{repr:'0x2::coin::Coin<'+SUI_MAINNET_USDC_TYPE+'>'},json:{balance:r.variables.cursor?'6000000':'4000000'}}}],pageInfo:{hasNextPage:!r.variables.cursor,endCursor:r.variables.cursor?'opaque-end':'opaque-page-two'}}}}}));
});
test('owned-object, balance and transaction pages use the same gateway guard',async()=>{
 await withGateway(async(client,requests)=>{
  await client.getOwnedObjects({owner,limit:100});await client.getOwnedObjects({owner,limit:5,cursor:'objects-two'});
  await client.core.listBalances({owner,limit:100,cursor:'balances-two'});
  await client.core.listTransactions({limit:100,order:'descending',before:'transactions-two'});
  assert.deepEqual(requests.slice(0,3).map(r=>r.variables.limit),[50,5,50]);
  assert.equal(requests[1].variables.cursor,'objects-two');assert.equal(requests[2].variables.cursor,'balances-two');
  assert.equal(requests[3].variables.last,50);assert.equal(requests[3].variables.before,'transactions-two');
 },r=>/query getOwnedObjects/.test(r.query)?{data:{address:{objects:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}:/query getAllBalances/.test(r.query)?{data:{address:{balances:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}:{data:{transactions:{nodes:[],pageInfo:{hasNextPage:false,hasPreviousPage:false,startCursor:null,endCursor:null}}}});
});
test('event facade passes opaque cursors using SDK before/after bounds and keeps smaller import pages',async()=>{
 const type=owner+'::core::ShareSettledEvent';
 await withGateway(async(client,requests)=>{
  const first=await client.queryEvents({query:{MoveEventType:type},order:'descending',limit:100});
  assert.equal(first.hasNextPage,true);const cursor=first.nextCursor as SettlementCursor|null;assert.equal(cursor?.cursor,'opaque-earlier-events');
  const second=await client.queryEvents({query:{MoveEventType:type},order:'descending',limit:5,cursor:first.nextCursor});
  assert.equal(second.hasNextPage,false);assert.equal(requests[1].variables.before,'opaque-earlier-events');assert.equal(requests[1].variables.last,5);
  const ascendingCursor:SettlementCursor={txDigest:digest,eventSeq:'0',cursor:'opaque-later-events'};
  await client.queryEvents({query:{MoveEventType:type},order:'ascending',limit:5,cursor:ascendingCursor});
  assert.equal(requests[2].variables.after,'opaque-later-events');assert.equal(requests[2].variables.first,5);
 },r=>({data:{events:{nodes:[{sequenceNumber:0,sender:{address:owner},transactionModule:{package:{address:owner},name:'core'},contents:{type:{repr:type},json:{amount:'1000000'}},transaction:{digest,effects:{checkpoint:{sequenceNumber:123}}}}],pageInfo:{hasPreviousPage:!r.variables.before,hasNextPage:false,startCursor:'opaque-earlier-events',endCursor:'opaque-later-events'}}}}));
});
test('coin read failures still propagate before any wallet handoff',async()=>{
 await withGateway(async(client)=>{
  await assert.rejects(client.getCoins({owner,coinType:SUI_MAINNET_USDC_TYPE,limit:100}),/provider unavailable/);
 },()=>({errors:[{message:'provider unavailable'}]}));
});
test('Solvency event scans start at the verified package publication and retain the same window on continuation',async()=>{
 const prior=process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID;
 process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=owner;
 const type=owner+'::core::SplitCreatedEvent';
 try{
  await withGateway(async(client,requests)=>{
   const first=await client.queryEvents({query:{MoveEventType:type},limit:5});
   assert.equal(first.data[0].type,type);
   assert.ok(first.nextCursor);
   const second=await client.queryEvents({query:{MoveEventType:type},limit:5,cursor:first.nextCursor});
   assert.equal(second.hasNextPage,false);
   assert.equal(requests.length,3);
   assert.equal(requests[2].variables.before,'earlier');
  },r=>{
   if(r.query.includes('query EventOrigin'))return {data:{package:{address:owner,previousTransaction:{effects:{checkpoint:{sequenceNumber:321}}}}}};
   const filter=r.variables.filter as {afterCheckpoint:number;type:string};
   assert.deepEqual(filter,{type,afterCheckpoint:320});
   return {data:{events:{nodes:r.variables.before?[]:[{sequenceNumber:0,sender:{address:owner},transactionModule:{package:{address:owner},name:'core'},contents:{type:{repr:type},json:{split_id:id}},transaction:{digest,effects:{checkpoint:{sequenceNumber:321}}}}],pageInfo:{hasPreviousPage:!r.variables.before,hasNextPage:false,startCursor:'earlier',endCursor:'later'}}}};
  });
 }finally{if(prior===undefined)delete process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID;else process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=prior;}
});
