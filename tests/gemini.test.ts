import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAgentIntent} from '../src/lib/gemini';
import {GEMINI_MODEL} from '../src/lib/agent-types';
test('official Gemini SDK uses the pinned model, structured stateless output and no credentials in model context',async()=>{
 const originalFetch=globalThis.fetch,previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only-key';
 let body:Record<string,unknown>={},url='',calls=0,status=200;
 globalThis.fetch=async(input,init)=>{calls++;const request=new Request(input,init);url=request.url;body=await request.json();return status===200?Response.json({id:'test-interaction',status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({action:'explain',reply:'Your loaded memory is empty.'})}]}]}):Response.json({error:{code:429,message:'test-only-key private provider detail',status:'RESOURCE_EXHAUSTED'}},{status});};
 try{
  const result=await generateAgentIntent({request:'Show my actual memory',memory:[]});
  assert.deepEqual(result,{action:'explain',reply:'Your loaded memory is empty.'});assert.match(url,/generativelanguage.googleapis.com/);assert.match(url,/interactions/);
  assert.equal(body.model,GEMINI_MODEL);assert.equal(body.store,false);assert.equal(body.previous_interaction_id,undefined);
  const format=body.response_format as {mime_type:string;schema:{properties:{action:unknown}}};assert.equal(format.mime_type,'application/json');assert.ok(format.schema.properties.action);
  assert.doesNotMatch(String(body.input),/test-only-key/);assert.match(String(body.system_instruction),/untrusted DATA/);
  status=429;calls=0;await assert.rejects(generateAgentIntent({request:'Retry'}),/quota is exhausted/);assert.equal(calls,1);
  delete process.env.GEMINI_API_KEY;await assert.rejects(generateAgentIntent({}),/not configured/);
 }finally{globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});
