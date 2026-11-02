import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMemory} from '../src/lib/memory-api';
import {GEMINI_MODEL} from '../src/lib/agent-types';
test('signed learning responses cannot silently become empty history, and Smart Fill uses its authenticated endpoint',async()=>{
 const fetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);let response:unknown={},path='',message='';
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:3000'}}});
 globalThis.fetch=async(input)=>{path=String(input);return Response.json(response);};
 const sign=async({message:bytes}:{message:Uint8Array})=>{message=new TextDecoder().decode(bytes);return {signature:'test-only'};};
 try{
  await assert.rejects(requestMemory({action:'refresh_learning',walletAddress:wallet},sign),/incomplete/);
  response={memories:[],verifiedSettlements:[],rejectedEvidenceCount:0,tatumAnchor:{checkpoint:'123'}};assert.deepEqual((await requestMemory({action:'refresh_learning',walletAddress:wallet},sign)).memories,[]);
  await assert.rejects(requestMemory({action:'smart_split',walletAddress:wallet,text:'My exact receipt'},sign),/validated bill draft/);assert.equal(path,'/api/smart-split');assert.match(message,/My exact receipt/);assert.match(message,/smart_split/);
  await assert.rejects(requestMemory({action:'settlement',walletAddress:wallet,digest:'3'.repeat(44)},sign),/without paying again/);
 }finally{globalThis.fetch=fetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});

test('chat requests bind the signed nonce to a committed owned conversation response',async()=>{
 const fetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64),threadId='test-thread-00000001';let mode='ok',path='',signature='';
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:3000'}}});
 globalThis.fetch=async(input,init)=>{path=String(input);const e=JSON.parse(String(init?.body));const agent={id:e.nonce,owner:wallet,threadId,user:e.payload.text,blobId:'test-blob',model:GEMINI_MODEL,action:{kind:'none'}};
  if(mode==='nonce')agent.id='another-nonce';if(mode==='owner')agent.owner='0x'+'2'.repeat(64);if(mode==='thread')agent.threadId='foreign-thread-0001';
  return Response.json({status:mode==='pending'?'PENDING':'COMMITTED',agent,createdMemories:mode==='blob'?[]:[{blob_id:'test-blob'}],memories:[],verifiedSettlements:[],rejectedEvidenceCount:0,tatumAnchor:{checkpoint:'123'}});
 };
 const sign=async({message}:{message:Uint8Array})=>{signature=new TextDecoder().decode(message);return {signature:'test-only'};};
 try{
  await requestMemory({action:'agent_chat',walletAddress:wallet,text:'An actual request',threadId,timeZone:'UTC'},sign);assert.equal(path,'/api/agent');assert.match(signature,/An actual request/);assert.match(signature,/test-thread-00000001/);
  for(mode of ['nonce','owner','thread','blob','pending'])await assert.rejects(requestMemory({action:'agent_chat',walletAddress:wallet,text:'An actual request',threadId,timeZone:'UTC'},sign),/No action is available/);
 }finally{globalThis.fetch=fetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
