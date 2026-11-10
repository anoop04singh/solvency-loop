import test from 'node:test';
import assert from 'node:assert/strict';
import {agentProgressResponse,readAgentProgressResponse} from '../src/lib/agent-progress-stream';
import {mergeAgentProgress,type AgentProgress} from '../src/lib/agent-progress';
import {requestMemory,AutopilotUncertainError} from '../src/lib/memory-api';
import {AgentReplyError,GEMINI_MODEL} from '../src/lib/agent-types';

test('idle work sends keepalives without claiming progress or completing before its result',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const response=agentProgressResponse(async()=>{await gate;return {status:'READY'};},()=>({error:'failed',noFinancialExecution:true}));
 const reader=response.body!.getReader(),decoder=new TextDecoder();
 assert.deepEqual(JSON.parse(decoder.decode((await reader.read()).value)),{type:'heartbeat'});
 t.mock.timers.tick(5_000);
 assert.deepEqual(JSON.parse(decoder.decode((await reader.read()).value)),{type:'heartbeat'});
 release();
 assert.equal(JSON.parse(decoder.decode((await reader.read()).value)).type,'result');
 assert.equal((await reader.read()).done,true);
 t.mock.timers.tick(10_000);
 assert.equal((await reader.read()).done,true);
 reader.releaseLock();
 await assert.rejects(readAgentProgressResponse(new Response('{"type":"heartbeat"}\n')),/interrupted/);
});

test('progress arrives during actual work, tolerates chunk boundaries and requires a final result',async()=>{
 let release!:()=>void,first!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{first=resolve;}),events:AgentProgress[]=[];
 const response=agentProgressResponse(async progress=>{progress({stage:'account',state:'active',at:Date.now()});await gate;progress({stage:'account',state:'complete',at:Date.now(),checkpoint:'123'});return {status:'READY'};},()=>({error:'failed',noFinancialExecution:true}));
 const reading=readAgentProgressResponse(response,event=>{events.push(event);first();});
 await started;assert.deepEqual(events.map(e=>e.state),['active']);release();assert.equal((await reading).data.status,'READY');assert.equal(events[1].checkpoint,'123');
 const encoded=new TextEncoder().encode(JSON.stringify({type:'result',data:{status:'Reply €'}})+'\n');let index=0;
 const chunks=new ReadableStream<Uint8Array>({pull(controller){if(index===encoded.length)controller.close();else{controller.enqueue(encoded.slice(index,index+1));index++;}}});
 assert.equal((await readAgentProgressResponse(new Response(chunks))).data.status,'Reply €');
 await assert.rejects(readAgentProgressResponse(new Response('{"type":"progress","progress":{"stage":"account","state":"active","at":1}}\n')),/interrupted/);
 assert.equal(mergeAgentProgress([events[1]],{stage:'account',state:'active',at:Date.now()}).at(-1)?.state,'complete');
});

test('closing a progress stream never replays or cancels an authorized unit of work',async()=>{
 let release!:()=>void,finish!:()=>void,calls=0;
 const gate=new Promise<void>(resolve=>{release=resolve;}),done=new Promise<void>(resolve=>{finish=resolve;});
 const response=agentProgressResponse(async progress=>{calls++;progress({stage:'account',state:'active',at:Date.now()});await gate;progress({stage:'account',state:'complete',at:Date.now()});finish();return {status:'READY'};},()=>({error:'failed',noFinancialExecution:false}));
 await response.body!.cancel();release();await done;assert.equal(calls,1);
});

test('streamed replies retain nonce validation, safe rejections and uncertain financial outcome handling',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:3000'}}});
 let mode='ok',calls=0;
 const payload={action:'agent_chat' as const,walletAddress:wallet,text:'An actual request',threadId:'test-thread-00000001',timeZone:'UTC',autoExecute:true,allowanceEpoch:'0'};
 globalThis.fetch=async(_url,init)=>{
  calls++;assert.equal((init!.headers as Record<string,string>).Accept,'application/x-ndjson');const e=JSON.parse(String(init!.body));
  if(mode==='truncated')return new Response('{"type":"progress","progress":{"stage":"execution","state":"active","at":1}}\n',{headers:{'Content-Type':'application/x-ndjson'}});
  if(mode==='safe'||mode==='uncertain')return agentProgressResponse(async()=>{throw Error('Gemini failed');},()=>({error:'Gemini failed',code:'agent_reply',noFinancialExecution:mode==='safe'}));
  return agentProgressResponse(async progress=>{progress({stage:'account',state:'complete',at:Date.now(),checkpoint:'123'});return {status:'READY',agent:{id:mode==='bad-nonce'?'different-nonce':e.nonce,owner:wallet,threadId:e.payload.threadId,user:e.payload.text,blobId:'',model:GEMINI_MODEL,action:{kind:'none'}},createdMemories:[],memories:[],verifiedSettlements:[],rejectedEvidenceCount:0,tatumAnchor:{checkpoint:'123'}} as never;},()=>({error:'failed',noFinancialExecution:true}));
 };
 try{
  const events:AgentProgress[]=[];await requestMemory(payload,async()=>({signature:'test-only'}),e=>events.push(e));assert.ok(events.some(e=>e.stage==='account'));assert.equal(events.at(-1)?.stage,'response');
  mode='safe';await assert.rejects(requestMemory(payload,async()=>({signature:'test-only'}),()=>{}),AgentReplyError);
  for(mode of ['truncated','bad-nonce','uncertain'])await assert.rejects(requestMemory(payload,async()=>({signature:'test-only'}),()=>{}),AutopilotUncertainError);
  mode='ok';await requestMemory(payload,async()=>({signature:'test-only'}),()=>{throw Error('Broken presentation observer');});assert.equal(calls,6);
 }finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
