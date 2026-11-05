import test from 'node:test';
import assert from 'node:assert/strict';
import {Ed25519Keypair} from '@mysten/sui/keypairs/ed25519';
import {startMemorySession,authorizeMemoryRequest,endMemorySession,memorySessionStatus} from '../src/lib/memory-session';
import {verifyMemoryEnvelope} from '../src/lib/memory-auth';
import {sessionSigningMessage,MEMORY_SESSION_MS} from '../src/lib/memory-session-protocol';
test('one wallet approval authorizes payload-bound temporary requests, not another account or origin',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),key=Ed25519Keypair.generate(),wallet=key.toSuiAddress(),accountId='0x'+'4'.repeat(64),origin='http://127.0.0.1:3000';let prompts=0;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin}}});
 const sign=async({message}:{message:Uint8Array})=>{prompts++;return key.signPersonalMessage(message);};
 try{
  const grant=await startMemorySession(wallet,accountId,sign);assert.equal(grant.expiresAt-grant.issuedAt,MEMORY_SESSION_MS);assert.equal(prompts,1);assert.match(sessionSigningMessage(grant),/Financial execution requires a separately funded/);
  for(const action of ['recall_all','remember'] as const){const e=await authorizeMemoryRequest({action,walletAddress:wallet,...(action==='remember'?{text:'My actual note'}:{})},sign);assert.equal(e.payload.sessionAccountId,accountId);await verifyMemoryEnvelope(e,origin);assert.ok(e.delegation);assert.equal(prompts,1);
   await assert.rejects(verifyMemoryEnvelope({...e,payload:{...e.payload,text:'Tampered'}},origin));await assert.rejects(verifyMemoryEnvelope({...e,nonce:'another-request-0001'},origin));await assert.rejects(verifyMemoryEnvelope(e,'https://foreign.example'));await assert.rejects(verifyMemoryEnvelope({...e,payload:{...e.payload,sessionAccountId:wallet}},origin));
  }
  assert.equal(memorySessionStatus(wallet)?.accountId,accountId);assert.equal(memorySessionStatus(accountId),null);
  const learn={action:'agent_chat' as const,walletAddress:wallet,text:'I prefer to split dinner equally',threadId:'test-thread-00000001',timeZone:'UTC',autoMemory:true};
  const learnedRequest=await authorizeMemoryRequest(learn,sign);
  await verifyMemoryEnvelope(learnedRequest,origin);assert.equal(prompts,1);
  await assert.rejects(verifyMemoryEnvelope({...learnedRequest,delegation:undefined},origin),/Quiet Memory authorization/);
  const clock=Date.now;
  try{
   Date.now=()=>grant.expiresAt+1;
   const requests=await Promise.all([1,2].map(()=>authorizeMemoryRequest({action:'recall_all',walletAddress:wallet},sign)));
   assert.equal(prompts,2,'concurrent requests share a single renewal approval');
   assert.ok(requests.every(request=>request.delegation?.grant.issuedAt===grant.expiresAt+1));
   await verifyMemoryEnvelope(requests[0],origin);
  }finally{Date.now=clock;}
  endMemorySession();assert.equal(memorySessionStatus(wallet),null);await authorizeMemoryRequest({action:'recall_all',walletAddress:wallet},sign);assert.equal(prompts,3);
 }finally{endMemorySession();if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
