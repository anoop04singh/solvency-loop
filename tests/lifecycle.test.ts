import test from 'node:test';
import assert from 'node:assert/strict';
import {Ed25519Keypair} from '@mysten/sui/keypairs/ed25519';
import {executeMemoryRequest,type MemoryDependencies} from '../src/lib/memory-service';
import {computeExpense} from '../src/lib/expense';
import {CATEGORIES,getWalletNamespace,SUI_MAINNET_USDC_TYPE,type SolvencyNamespaceCategory} from '../src/lib/config';
import {memorySigningMessage,type MemoryPayload,type RecalledMemory} from '../src/lib/memory-protocol';
import {verifyMemoryEnvelope} from '../src/lib/memory-auth';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),owner=a(1),payer=a(2),pkg=a(9),now=Date.UTC(2026,10,1),day=86400000;
process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=pkg;process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=a(10);
function fixture(){
 const storage=new Map<string,Map<string,RecalledMemory>>(),events:Record<string,unknown>[]=[],recalls:string[]=[],writes:string[]=[],pages:number[]=[];
 let failRecall=false,missingBlob=false;
 const deps={state:async(wallet:string)=>({profileId:a(20),wallet,handle:'Owned test profile',memwalAccountId:a(wallet===owner?21:22),safeFloorUsdc:0,contacts:[{handle:'Saved contact',walletAddress:payer}],usdcBalance:200,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true}),access:async(wallet:string,accountId:string)=>({accountId,owner:wallet,active:true,delegateAuthorized:true,delegateCount:1}),
 client:(wallet:string,category:SolvencyNamespaceCategory,accountId:string)=>({recall:async()=>{if(failRecall)throw Error('relayer unavailable');recalls.push(category);return {results:[...(storage.get(accountId+category)?.values()||[])],total:0};},rememberAndWait:async(text:string,options?:Parameters<ReturnType<MemoryDependencies['client']>['rememberAndWait']>[1])=>{if(missingBlob)return {id:'job'};const key=typeof options==='object'?options.idempotencyKey!:'';const slot=accountId+category;if(!storage.has(slot))storage.set(slot,new Map());const records=storage.get(slot)!;if(!records.has(key)){writes.push(wallet);records.set(key,{text,blob_id:'committed-'+writes.length,category,namespace:getWalletNamespace(wallet,category)});}return {id:'job',blob_id:records.get(key)!.blob_id};},analyzeAndWait:async()=>({}),restore:async()=>({})}),
 events:async({cursor,limit}:Parameters<MemoryDependencies['events']>[0])=>{assert.equal(limit,5);const offset=cursor?Number(cursor.eventSeq):0;pages.push(offset);const data=events.slice(offset,offset+5);return {data,hasNextPage:offset+5<events.length,nextCursor:{txDigest:'3'.repeat(44),eventSeq:String(offset+5),cursor:'page-'+(offset+5)}};},
 transaction:async({digest}:Parameters<MemoryDependencies['transaction']>[0])=>({effects:{status:{status:'success'}},events:events.filter(e=>(e.id as {txDigest:string}).txDigest===digest),checkpoint:'123'}),
 object:async({id}:Parameters<MemoryDependencies['object']>[0])=>{const event=events.find(e=>(e.parsedJson as {split_id:string}).split_id===id)!;return {data:{content:{dataType:'moveObject',type:pkg+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>',fields:{created_at_ms:String((event.parsedJson as {created:number}).created)}}}};}
 } as unknown as MemoryDependencies;
 const add=(id:number,lag:number,settled=now+id*1000)=>{const digest='3'.repeat(42)+'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(id/30)]+'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[id%30];events.unshift({id:{txDigest:digest,eventSeq:'0'},type:pkg+'::core::ShareSettledEvent',parsedJson:{payer,recipient:owner,split_id:a(100+id),amount:'50000000',settled_at_ms:String(settled),created:settled-lag}});return digest;};
 return {deps,events,storage,writes,recalls,pages,add,setFailRecall:(v:boolean)=>{failRecall=v;},setMissingBlob:()=>{missingBlob=true;}};
}
test('creator learning evolves only from real confirmed events imported by its own signed session',async()=>{
 const f=fixture();for(let i=0;i<3;i++)f.add(i,14*day);
 const first=await executeMemoryRequest({action:'refresh_learning',walletAddress:owner},'first-session',f.deps);
 assert.equal(first.count,3);assert.equal(first.verifiedSettlements?.length,3);assert.deepEqual(f.recalls,[...CATEGORIES]);
 const people=[{id:'contact',handle:'Saved contact',walletAddress:payer,customAmount:'',upfront:false}];
 const compute=(r:typeof first)=>computeExpense(owner,people,'100','equal',r.memories!,true,{observations:r.verifiedSettlements});
 assert.equal(compute(first).shares[0].requiresUpfrontEscrow,true);
 const creatorWrites=f.writes.filter(w=>w===owner).length;
 const digest=f.add(3,3*60000);const paid=await executeMemoryRequest({action:'settlement',walletAddress:payer,digest},'payer-session',f.deps);
 assert.equal(paid.createdMemories?.length,1);assert.equal(f.writes.filter(w=>w===owner).length,creatorWrites);assert.equal(f.writes.at(-1),payer);
 for(let i=4;i<8;i++)f.add(i,3*60000);
 const updated=await executeMemoryRequest({action:'refresh_learning',walletAddress:owner},'creator-return',f.deps);
 assert.equal(updated.verifiedSettlements?.length,8);assert.equal(compute(updated).shares[0].requiresUpfrontEscrow,false);assert.equal(compute(updated).shares[0].history.count,5);
 const writes=f.writes.length;await executeMemoryRequest({action:'refresh_learning',walletAddress:owner},'creator-retry',f.deps);assert.equal(f.writes.length,writes);
});
test('empty learning is valid, bounded history exposes a continuation and failures never become empty success',async()=>{
 const f=fixture();const empty=await executeMemoryRequest({action:'refresh_learning',walletAddress:owner},'empty',f.deps);assert.deepEqual(empty.memories,[]);assert.equal(empty.count,0);assert.equal(f.writes.length,0);
 for(let i=0;i<23;i++)f.add(i,60000);
 const page=await executeMemoryRequest({action:'refresh_learning',walletAddress:owner},'bounded',f.deps);assert.equal(page.scanned,20);assert.equal(page.nextCursor?.eventSeq,'20');
 const last=await executeMemoryRequest({action:'refresh_learning',walletAddress:owner,cursor:page.nextCursor!},'continued',f.deps);assert.equal(last.scanned,3);assert.equal(last.nextCursor,null);
 f.setFailRecall(true);await assert.rejects(executeMemoryRequest({action:'refresh_learning',walletAddress:owner},'failure',f.deps),/relayer unavailable/);
 const broken=fixture();broken.add(0,60000);broken.setMissingBlob();await assert.rejects(executeMemoryRequest({action:'settlement',walletAddress:payer,digest:String((broken.events[0].id as {txDigest:string}).txDigest)},'missing',broken.deps),/committed Walrus blob/);
});
test('Smart Fill resolves current on-chain contacts and returns a draft with fresh owned learning',async()=>{
 const f=fixture();const result=await executeMemoryRequest({action:'smart_split',walletAddress:owner,text:'Paid 16.50 at My receipt (11.50 food, 5 drinks) with Saved contact'},'smart',f.deps);
 assert.equal(result.draft?.title,'My receipt');assert.equal(result.draft?.people[0].walletAddress,payer);assert.equal(result.draft?.total,'16.50');assert.deepEqual(f.recalls,[...CATEGORIES]);assert.equal(f.writes.length,0);
 await assert.rejects(executeMemoryRequest({action:'smart_split',walletAddress:owner,text:'Paid 16.50 at My receipt with Unknown contact'},'unknown',f.deps),/unambiguous saved contact/);
});
test('learning and Smart Fill signatures bind their full action, text, origin and history cursor',async()=>{
 const key=new Ed25519Keypair(),origin='http://127.0.0.1:3000';
 for(const action of ['refresh_learning','smart_split'] as const){const payload:MemoryPayload={action,walletAddress:key.toSuiAddress(),...(action==='smart_split'?{text:'User-entered receipt'}:{cursor:{txDigest:'3'.repeat(44),eventSeq:'20'}})};const envelope={payload,issuedAt:Date.now(),nonce:crypto.randomUUID(),origin};const signed={...envelope,...await key.signPersonalMessage(new TextEncoder().encode(memorySigningMessage(envelope)))};await verifyMemoryEnvelope(signed,origin);await assert.rejects(verifyMemoryEnvelope({...signed,payload:{...payload,...(action==='smart_split'?{text:'Changed receipt'}:{cursor:{txDigest:'3'.repeat(44),eventSeq:'25'}})}},origin));}
});
