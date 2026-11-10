import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMemory,AutopilotUncertainError} from '../src/lib/memory-api';
import {AgentReplyError,GEMINI_MODEL} from '../src/lib/agent-types';
import {agentProgressResponse} from '../src/lib/agent-progress-stream';
import type {AgentProgress} from '../src/lib/agent-progress';

test('sign-in reports observed phase counts and never reports ready before the last evidence page succeeds',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://workspace.example'}}});
 try{for(const fail of [false,true]){
  const events:AgentProgress[]=[];let release!:()=>void,arrived!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{arrived=resolve;});
  globalThis.fetch=async(_input,init)=>{
   const {payload:p}=JSON.parse(String(init?.body)),meta={readPhase:p.readPhase,memoryAccountId:wallet,tatumAnchor:{checkpoint:'123'}};
   if(p.readPhase==='personal')return Response.json({...meta,memories:[{namespace:'test-only',blob_id:'test-fact',category:'habit_regret',text:'Fixture only'}]});
   if(p.readPhase==='social')return Response.json({...meta,memories:[],verifiedSettlements:[],publicPreferences:[],groups:[]});
   if(p.evidenceOffset===5){arrived();await gate;if(fail)return Response.json({error:'Evidence provider unavailable',noFinancialExecution:true},{status:502});}
   return Response.json({...meta,verifiedSettlements:[{digest:'fixture-proof'}],rejectedEvidenceCount:0,evidenceSnapshot:'a'.repeat(64),nextEvidenceOffset:p.evidenceOffset===0?5:null});
  };
  const pending=requestMemory({action:'recall_all',walletAddress:wallet},async()=>({signature:'test-only'}),event=>events.push(event));
  await waiting;
  assert.equal(events.find(e=>e.stage==='personal_memory'&&e.state==='complete')?.count,1);
  assert.ok(events.some(e=>e.stage==='social_context'&&e.state==='complete'));
  assert.equal(events.filter(e=>e.stage==='evidence').at(-1)?.count,1);
  assert.ok(!events.some(e=>['evidence','response'].includes(e.stage)&&e.state==='complete'));
  release();
  if(fail){await assert.rejects(pending,/Evidence provider unavailable/);assert.ok(!events.some(e=>e.stage==='response'&&e.state==='complete'));}
  else{await pending;assert.equal(events.find(e=>e.stage==='evidence'&&e.state==='complete')?.count,2);assert.equal(events.at(-1)?.stage,'response');assert.equal(events.at(-1)?.state,'complete');}
 }}finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});

test('sign-in negotiates streaming and rejects a heartbeat-only response instead of accepting empty learning',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://workspace.example'}}});
 let interrupted=false;
 globalThis.fetch=async(_input,init)=>{
  assert.equal(new Headers(init?.headers).get('accept'),'application/x-ndjson');
  const envelope=JSON.parse(String(init?.body));
  assert.equal(envelope.origin,'https://workspace.example');
  if(interrupted)return new Response('{"type":"heartbeat"}\n',{headers:{'Content-Type':'application/x-ndjson'}});
  return agentProgressResponse(async()=>envelope.payload.action==='recall_all'
   ?{readPhase:envelope.payload.readPhase,memoryAccountId:wallet,memories:[],verifiedSettlements:[],rejectedEvidenceCount:0,publicPreferences:[],groups:[],evidenceSnapshot:'a'.repeat(64),nextEvidenceOffset:null,tatumAnchor:{checkpoint:'123'}}
   :{learnedMemories:[]},()=>({error:'failed',noFinancialExecution:true}));
 };
 try{
  const sign=async()=>({signature:'test-only'});
  assert.deepEqual((await requestMemory({action:'recall_all',walletAddress:wallet},sign)).memories,[]);
  assert.deepEqual((await requestMemory({action:'recall_learning',walletAddress:wallet},sign)).learnedMemories,[]);
  interrupted=true;
  await assert.rejects(requestMemory({action:'recall_all',walletAddress:wallet},sign),/interrupted/);
 }finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});

test('personal learning completes all signed phases and bounded evidence pages before returning insights',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64),account='0x'+'2'.repeat(64),snapshot='a'.repeat(64);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://workspace.example'}}});
 const phases:string[]=[],offsets:number[]=[];let mode='ok';
 globalThis.fetch=async(_input,init)=>{
  const envelope=JSON.parse(String(init?.body)),p=envelope.payload;
  phases.push(p.readPhase);
  const meta={readPhase:p.readPhase,memoryAccountId:mode==='account'&&p.readPhase==='social'?wallet:account,tatumAnchor:{checkpoint:'123'}};
  if(p.readPhase==='personal')return Response.json({...meta,memories:[{blob_id:'actual-test-fact',namespace:'test-only',category:'habit_regret',text:'An owned test fact'}]});
  if(p.readPhase==='social'){
   if(mode==='failure')return Response.json({error:'Shared context unavailable',noFinancialExecution:true},{status:502});
   return Response.json({...meta,memories:[],verifiedSettlements:[],publicPreferences:[],groups:[]});
  }
  offsets.push(p.evidenceOffset);if(p.evidenceOffset>0)assert.equal(p.evidenceSnapshot,snapshot);
  return Response.json({...meta,verifiedSettlements:[],rejectedEvidenceCount:1,evidenceLimitReached:true,evidenceSnapshot:snapshot,nextEvidenceOffset:mode==='cursor'?p.evidenceOffset:p.evidenceOffset===0?5:null});
 };
 try{
  const sign=async({message}:{message:Uint8Array})=>{assert.match(new TextDecoder().decode(message),/readPhase/);return {signature:'test-only'};};
  const result=await requestMemory({action:'recall_all',walletAddress:wallet},sign);
  assert.deepEqual(phases,['personal','social','evidence','evidence']);assert.deepEqual(offsets,[0,5]);
  assert.equal(result.memories?.length,1);assert.equal(result.rejectedEvidenceCount,2);assert.equal(result.evidenceLimitReached,true);
  for(mode of ['account','failure','cursor'])await assert.rejects(requestMemory({action:'recall_all',walletAddress:wallet},sign),/account changed|Shared context unavailable|pagination did not advance/);
 }finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});

test('host timeout JSON and HTML produce useful errors without exposing platform stacks or losing execution uncertainty',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://workspace.example'}}});
 try{
  const sign=async()=>({signature:'test-only'});
  for(const response of [
   new Response('<HTML><TITLE>Inactivity Timeout</TITLE><H1>Inactivity Timeout</H1></HTML>',{status:504,headers:{'x-nf-request-id':'netlify-public-reference'}}),
   Response.json({errorType:'Sandbox.Timedout',errorMessage:'Internal runtime details'},{status:502,headers:{'x-nf-request-id':'netlify-public-reference'}}),
  ]){
   globalThis.fetch=async()=>response.clone();
   await assert.rejects(requestMemory({action:'recall_all',walletAddress:wallet},sign),error=>{
    assert(error instanceof Error);assert.match(error.message,/timed out.*HTTP (504|502)/);
    assert.match(error.message,/netlify-public-reference/);assert.doesNotMatch(error.message,/<HTML>|Internal runtime details/);return true;
   });
  }
  globalThis.fetch=async()=>Response.json({message:'A private platform stack must not be exposed'},{status:500});
  await assert.rejects(requestMemory({action:'recall_all',walletAddress:wallet},sign),error=>{
   assert(error instanceof Error);assert.match(error.message,/HTTP 500/);assert.doesNotMatch(error.message,/private platform stack/);return true;
  });
  await assert.rejects(requestMemory({action:'agent_chat',walletAddress:wallet,text:'Pay my actual share',threadId:'test-thread-00000001',timeZone:'UTC',autoExecute:true,allowanceEpoch:'0'},sign),AutopilotUncertainError);
  globalThis.fetch=async()=>new Response('<html>A successful response cannot substitute for memory</html>');
  await assert.rejects(requestMemory({action:'recall_all',walletAddress:wallet},sign),/unreadable.*no empty fallback/);
 }finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
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

test('interrupted autonomous responses block new payments while authenticated pre-execution rejections stay safe',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:3000'}}});
 const payload={action:'agent_chat' as const,walletAddress:wallet,text:'Pay my actual share',threadId:'test-thread-00000001',timeZone:'UTC',autoExecute:true,allowanceEpoch:'0'},sign=async()=>({signature:'test-only'});
 try{
  globalThis.fetch=async()=>{throw Error('Network interrupted');};
  await assert.rejects(requestMemory(payload,sign),e=>e instanceof AutopilotUncertainError&&/^[a-f0-9]{64}$/.test(e.requestId));
  globalThis.fetch=async()=>Response.json({error:'Authorization rejected',noFinancialExecution:true},{status:401});
  await assert.rejects(requestMemory(payload,sign),e=>!(e instanceof AutopilotUncertainError)&&/Authorization rejected/.test(String(e)));
  globalThis.fetch=async()=>Response.json({error:'Gemini could not reply.',code:'agent_reply',noFinancialExecution:true},{status:502});
  await assert.rejects(requestMemory(payload,sign),AgentReplyError);
  globalThis.fetch=async()=>Response.json({error:'Interrupted',code:'agent_reply'},{status:502});
  await assert.rejects(requestMemory(payload,sign),AutopilotUncertainError);
  globalThis.fetch=async()=>new Response('invalid result');await assert.rejects(requestMemory(payload,sign),AutopilotUncertainError);
 }finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});

test('chat replies bind to the signed request and submitted actions require a committed audit',async()=>{
 const fetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64),threadId='test-thread-00000001';let mode='ok',path='',signature='';
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:3000'}}});
 globalThis.fetch=async(input,init)=>{path=String(input);const e=JSON.parse(String(init?.body));const agent={id:e.nonce,owner:wallet,threadId,user:e.payload.text,blobId:'test-blob',model:GEMINI_MODEL,action:{kind:'none'}};
  if(mode==='nonce')agent.id='another-nonce';if(mode==='owner')agent.owner='0x'+'2'.repeat(64);if(mode==='thread')agent.threadId='foreign-thread-0001';
  if(['tab','no-audit','chain-read'].includes(mode))agent.blobId='';
  if(mode==='chain-read')return Response.json({status:'READY',agent,createdMemories:[],tatumAnchor:{checkpoint:'123'}});
  return Response.json({status:mode==='pending'?'PENDING':agent.blobId?'COMMITTED':'READY',agent,execution:mode==='no-audit'?{state:'submitted'}:undefined,createdMemories:mode==='blob'||!agent.blobId?[]:[{blob_id:'test-blob'}],memories:[],verifiedSettlements:[],rejectedEvidenceCount:0,tatumAnchor:{checkpoint:'123'}});
 };
 const sign=async({message}:{message:Uint8Array})=>{signature=new TextDecoder().decode(message);return {signature:'test-only'};};
 try{
  await requestMemory({action:'agent_chat',walletAddress:wallet,text:'An actual request',threadId,timeZone:'UTC'},sign);assert.equal(path,'/api/agent');assert.match(signature,/An actual request/);assert.match(signature,/test-thread-00000001/);
  mode='tab';assert.equal((await requestMemory({action:'agent_chat',walletAddress:wallet,text:'An actual request',threadId,timeZone:'UTC'},sign)).status,'READY');
  mode='chain-read';const lookup=await requestMemory({action:'agent_chat',walletAddress:wallet,text:'What are my pending splits?',threadId,timeZone:'UTC'},sign);
  assert.equal(lookup.agent?.action.kind,'none');assert.equal(lookup.memories,undefined);
  for(mode of ['nonce','owner','thread','blob','pending','no-audit'])await assert.rejects(requestMemory({action:'agent_chat',walletAddress:wallet,text:'An actual request',threadId,timeZone:'UTC'},sign),/No action is available/);
 }finally{globalThis.fetch=fetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
