import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {Ed25519Keypair} from '@mysten/sui/keypairs/ed25519';
import {handleMemoryRequest} from '../src/lib/memory-route';
import {verifyMemoryEnvelope} from '../src/lib/memory-auth';
import {memorySigningMessage} from '../src/lib/memory-protocol';
import {readAgentProgressResponse} from '../src/lib/agent-progress-stream';
import {AgentReplyError} from '../src/lib/agent-types';
const origin='http://127.0.0.1:3000';
async function signedRequest(valid=true){
 const key=new Ed25519Keypair(),envelope={payload:{action:'agent_chat' as const,walletAddress:key.toSuiAddress(),text:'What are my pending splits?',threadId:'test-thread-00000001',timeZone:'UTC'},issuedAt:Date.now(),nonce:crypto.randomUUID(),origin};
 const signature=(await key.signPersonalMessage(new TextEncoder().encode(memorySigningMessage(envelope)))).signature;
 return new NextRequest(origin+'/api/agent',{method:'POST',headers:{origin,host:'127.0.0.1:3000',Accept:'application/x-ndjson'},body:JSON.stringify({...envelope,signature:valid?signature:'invalid'})});
}
test('the real route authenticates before streaming and cannot execute an invalid signed request',async()=>{
 let calls=0;
 const deps={verify:verifyMemoryEnvelope,execute:async()=>{calls++;return {status:'READY'};},after:()=>{throw Error('No background write expected');}};
 const rejected=await handleMemoryRequest(await signedRequest(false),'agent_chat',deps);assert.equal(rejected.status,401);assert.equal(calls,0);
 const accepted=await handleMemoryRequest(await signedRequest(),'agent_chat',deps);assert.match(accepted.headers.get('content-type')!,/x-ndjson/);assert.match(accepted.headers.get('cache-control')!,/no-store/);assert.equal((await readAgentProgressResponse(accepted)).data.status,'READY');assert.equal(calls,1);
});
test('streamed route errors redact secrets and preserve uncertainty once execution may have started',async()=>{
 const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-secret-must-never-appear';
 try{for(const execution of [false,true]){
  const response=await handleMemoryRequest(await signedRequest(),'agent_chat',{verify:verifyMemoryEnvelope,after:()=>{},execute:async(_p,_nonce,_deps,work)=>{if(execution)work!.progress!({stage:'execution',state:'active',at:Date.now()});throw new AgentReplyError('Failure '+process.env.GEMINI_API_KEY);}});
  const result=await readAgentProgressResponse(response);assert.equal(result.ok,false);assert.equal(result.data.noFinancialExecution,!execution);assert.equal(result.data.code,'agent_reply');assert.equal(result.data.error,'Failure [redacted]');
 }}finally{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});

test('confirmed delivery is registered after the response instead of holding the agent stream open',async()=>{
 const tasks:(()=>Promise<void>)[]=[];
 const response=await handleMemoryRequest(await signedRequest(),'agent_chat',{
  verify:verifyMemoryEnvelope,after:task=>{tasks.push(task);},
  execute:async(_payload,_nonce,_deps,work)=>{
   assert.equal(typeof work?.deliverConfirmed,'function');
   work!.deliverConfirmed!('5'.repeat(44));
   return {status:'COMMITTED',execution:{state:'confirmed',digest:'5'.repeat(44),requestId:'a'.repeat(64),kind:'split'}};
  },
 });
 const parsed=await readAgentProgressResponse(response);
 assert.equal(parsed.data.execution?.state,'confirmed');
 assert.equal(tasks.length,1,'Incoming work must be attached to the request lifetime without delaying its result.');
});
