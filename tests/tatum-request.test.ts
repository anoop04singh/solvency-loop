import test from 'node:test';
import assert from 'node:assert/strict';
import {createTatumRequester,validateGraphqlPayload} from '../src/lib/tatum-request';
const query={query:'query { checkpoint { sequenceNumber } }'};
test('Tatum read bursts are coalesced and 429 retries respect Retry-After',async()=>{
 const old=process.env.TATUM_API_KEY;process.env.TATUM_API_KEY='test-key';let calls=0,clock=0;const delays:number[]=[];
 try{const request=createTatumRequester((async()=>{calls++;return calls===1?new Response('busy',{status:429,headers:{'Retry-After':'2'}}):Response.json({data:{checkpoint:{sequenceNumber:1}}});}) as typeof fetch,{intervalMs:400,now:()=>clock,sleep:async ms=>{delays.push(ms);clock+=ms;}});
 const r=await Promise.all([request(query),request(query),request(query)]);assert.equal(calls,2);assert.ok(delays.some(d=>d>=2000));for(const response of r)assert.equal((await response.json()).data.checkpoint.sequenceNumber,1);
 }finally{if(old===undefined)delete process.env.TATUM_API_KEY;else process.env.TATUM_API_KEY=old;}
});
test('signed transaction mutations are never retried or coalesced',async()=>{
 const old=process.env.TATUM_API_KEY;process.env.TATUM_API_KEY='test-key';let calls=0;
 try{const request=createTatumRequester((async()=>{calls++;return new Response('busy',{status:429});}) as typeof fetch,{intervalMs:0});const mutation={query:'mutation { executeTransaction(transactionDataBcs:"AA==",signatures:[]) { errors } }'};
 await Promise.all([request(mutation),request(mutation)]);assert.equal(calls,2);
 }finally{if(old===undefined)delete process.env.TATUM_API_KEY;else process.env.TATUM_API_KEY=old;}
});
test('the proxy accepts GraphQL operations and rejects legacy JSON-RPC and arbitrary mutations',()=>{
 assert.equal(validateGraphqlPayload(query),query);
 for(const q of [{jsonrpc:'2.0',method:'sui_getObject',params:[]},{query:'subscription { checkpoints }'},{query:'query A { checkpoint { digest } } query B { checkpoint { digest } }'},{query:'mutation { arbitraryOperation }'},{query:'mutation { ...Arbitrary } fragment Arbitrary on Mutation { arbitraryOperation }'}])assert.throws(()=>validateGraphqlPayload(q));
});
