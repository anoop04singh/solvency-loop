import test from 'node:test';
import assert from 'node:assert/strict';
import {agentSchema,generateAgentIntent} from '../src/lib/gemini';
import {GEMINI_MODEL} from '../src/lib/agent-types';
test('official Gemini SDK uses the pinned model, structured stateless output and no credentials in model context',async()=>{
 const originalFetch=globalThis.fetch,previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only-key';
 let body:Record<string,unknown>={},url='',calls=0,status=200;
 const template={...Object.fromEntries(agentSchema.required.map(key=>[key,null])),action:'split',executionMode:'prepare',reply:'Review this travel split.',title:'Train tickets',amount:'30',currency:'USDC',includeCreator:true,people:[{contact:'Saved peer',amount:null,upfront:false,excludeAlcohol:false}],items:[],ids:[],billCategory:'travel',memoryCandidates:[]};
 let output:Record<string,unknown>=template;
 globalThis.fetch=async(input,init)=>{calls++;const request=new Request(input,init);url=request.url;body=await request.json();return status===200?Response.json({id:'test-interaction',status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(output)}]}]}):Response.json({error:{code:429,message:'test-only-key private provider detail',status:'RESOURCE_EXHAUSTED'}},{status});};
 try{
  const result=await generateAgentIntent({request:'Show my actual memory',memory:[]});
  assert.deepEqual(result,template);assert.match(url,/generativelanguage.googleapis.com/);assert.match(url,/interactions/);
  assert.equal(body.model,GEMINI_MODEL);assert.equal(body.store,false);assert.equal(body.previous_interaction_id,undefined);
  const format=body.response_format as {mime_type:string;schema:{properties:{action:unknown}}};assert.equal(format.mime_type,'application/json');assert.ok(format.schema.properties.action);
  assert.doesNotMatch(String(body.input),/test-only-key/);assert.match(String(body.system_instruction),/untrusted DATA/);
  output={...template,billCategory:'unknown'};await assert.rejects(generateAgentIntent({request:'Split a bill'}),/validated response/);
  const request='Always categorize North Market as groceries.';
  output={...template,action:'preference',billCategory:'groceries',memoryCandidates:[{kind:'bill_category',topic:'north market',value:'groceries',evidence:request}]};
  const standing=await generateAgentIntent({request,memoryAutomationRequested:true}) as Record<string,unknown>;
  assert.equal(standing.action,'explain');assert.equal(standing.billCategory,null);assert.equal(standing.executionMode,'prepare');
  output={action:'split',billCategory:'travel'};await assert.rejects(generateAgentIntent({request:'Split a bill'}),/validated response/);
  status=429;calls=0;await assert.rejects(generateAgentIntent({request:'Retry'}),/quota is exhausted/);assert.equal(calls,1);
  delete process.env.GEMINI_API_KEY;await assert.rejects(generateAgentIntent({}),/not configured/);
 }finally{globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});
