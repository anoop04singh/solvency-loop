import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentTurn,prepareAgentAction,type AgentContext} from '../src/lib/agent-service';
import {GEMINI_MODEL,isAgentAction,recalledAgentTurns} from '../src/lib/agent-types';
import {executeMemoryRequest,type MemoryDependencies} from '../src/lib/memory-service';
import {validatePayload,memorySigningMessage,type MemoryPayload} from '../src/lib/memory-protocol';
import {DAY_MS} from '../src/lib/financial-insights';
const address=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const owner=address(1),friend=address(2),account=address(4),threadId='test-thread-00000001',nonce='test-agent-nonce-0001';
const now=Date.now();
process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=address(10);process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=address(11);
function context():AgentContext {return {profile:{profileId:address(3),wallet:owner,handle:'Test owner',contacts:[{handle:'Casey',walletAddress:friend}],memwalAccountId:account,safeFloorUsdc:20,usdcBalance:200.000001,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true},memories:[],verifiedSettlements:[],splits:[],vaults:[],now,timeZone:'UTC'};}
const split=(change:Record<string,unknown>={})=>({action:'split',title:'User supplied dinner',currency:'USDC',amount:'16.500001',includeCreator:true,people:[{contact:'Casey',amount:null,upfront:false,excludeAlcohol:false}],items:[],...change});
const request:MemoryPayload={action:'agent_chat',walletAddress:owner,text:'Share my dinner with Casey',threadId,timeZone:'UTC'};
test('agent splits conserve every micro-USDC and use actual saved contacts',()=>{
 const a=prepareAgentAction(split(),context()).action;assert.equal(a.kind,'split');if(a.kind!=='split')return;
 assert.equal(a.allocation.creatorShare,8.250001);assert.equal(a.allocation.shares[0].amountUsdc,8.25);assert.equal(a.allocation.shares[0].walletAddress,friend);assert.ok(isAgentAction(a));
 for(const change of [{amount:'1.0000001'},{amount:'-1'},{amount:'0'},{currency:'SUI'},{includeCreator:false},{people:[{contact:'Unknown'}]},{people:[{contact:'Casey'},{contact:'Casey'}]}])assert.throws(()=>prepareAgentAction(split(change),context()));
 const c=context();c.profile.contacts.push({handle:'Casey',walletAddress:address(5)});assert.throws(()=>prepareAgentAction(split(),c),/unambiguous/);
});
test('agent applies receipt exclusions without inventing a breakdown or accepting a foreign item wallet',()=>{
 const c=context();c.memories=[{blob_id:'rule',namespace:'test-only',category:'social_split_trust',text:'SOLVENCY_RULE_V1 '+JSON.stringify({subject:friend,upfrontAboveUsdc:40,excludeAlcohol:true,fundingPolicy:'adaptive'})}];
 assert.throws(()=>prepareAgentAction(split({title:'Food and drinks'}),c),/food and alcohol amounts/);
 const a=prepareAgentAction(split({amount:'16.50',items:[{label:'Food',kind:'food',amount:'11.50',people:[]},{label:'Drinks',kind:'alcohol',amount:'5',people:[]}]}),c).action;
 assert.equal(a.kind,'split');if(a.kind==='split'){assert.equal(a.allocation.shares[0].amountUsdc,5.75);assert.deepEqual(a.allocation.shares[0].excludedItems,['Drinks']);assert.equal(a.allocation.creatorShare,10.75);}
 assert.throws(()=>prepareAgentAction(split({items:[{label:'Food',kind:'food',amount:'16.500001',people:['Unknown']}]}),c));
 assert.throws(()=>prepareAgentAction(split({items:[{label:'Food',kind:'food',amount:'1',people:[]}]}),c),/add up exactly/);
});
test('agent enforces own settlement state, upstream funding and mature owned vaults',()=>{
 const c=context();c.splits=[{splitId:address(7),creator:address(8),title:'Actual bill',createdAtMs:now-DAY_MS,fundingDeadlineMs:now+DAY_MS,totalBillUsdc:30,creatorShareUsdc:15,isActive:true,isCancelled:false,pendingUpfront:0,participants:[{debtor:owner,amountOwedUsdc:15,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}]}];
 assert.equal(prepareAgentAction({action:'settle',ids:[address(7)]},c).action.kind,'settle');
 for(const kind of ['fund','activate','cancel','refund'])assert.throws(()=>prepareAgentAction({action:kind,ids:[address(7)]},c));
 c.splits[0].participants[0].debtor=friend;assert.throws(()=>prepareAgentAction({action:'settle',ids:[address(7)]},c),/your active unpaid/);
 c.splits[0].participants[0].debtor=owner;c.splits[0].isActive=false;c.splits[0].participants[0].requiresUpfrontEscrow=true;
 assert.equal(prepareAgentAction({action:'fund',ids:[address(7)]},c).action.kind,'fund');
 c.splits[0].fundingDeadlineMs=now-1;assert.throws(()=>prepareAgentAction({action:'fund',ids:[address(7)]},c));
 c.vaults=[{vaultId:address(9),amountUsdc:10,namespace:'test-only',unlockTimeMs:now+1}];
 assert.throws(()=>prepareAgentAction({action:'unlock',ids:[address(9)]},c),/matured/);c.vaults[0].unlockTimeMs=now;
 assert.equal(prepareAgentAction({action:'unlock',ids:[address(9)]},c).action.kind,'unlock');assert.throws(()=>prepareAgentAction({action:'unlock',ids:[address(99)]},c));
});
test('protection reserves unpaid obligations and cannot exceed the available balance',()=>{
 const c=context();assert.equal(prepareAgentAction({action:'protect',amount:'180.000001'},c).action.kind,'protect');assert.throws(()=>prepareAgentAction({action:'protect',amount:'180.000002'},c),/exceeds/);
});
test('agent context comes from owned Walrus history and commits only a proposal before returning',async()=>{
 const c=context();let stored='',key='',calls=0;
 const p={text:'Share dinner with Casey',threadId,nonce,context:c,generate:async()=>split(),remember:async(text:string,k:string)=>{stored=text;key=k;return {blob_id:'actual-test-blob'};}};
 const first=await createAgentTurn(p);assert.equal(first.turn.model,GEMINI_MODEL);assert.equal(first.turn.blobId,'actual-test-blob');assert.equal(key,'agent:'+nonce);assert.match(stored,/not an executed transaction/);
 c.memories=[first.memory];const second=await createAgentTurn({...p,nonce:'test-agent-nonce-0002',text:'Use that same bill',generate:async(value)=>{calls++;const input=value as {conversation:{user:string;status:string}[]};assert.equal(input.conversation.length,1);assert.equal(input.conversation[0].user,p.text);assert.match(input.conversation[0].status,/never assume execution/);return {action:'explain',reply:'That is a stored proposal, not a payment.'};}});
 assert.equal(calls,1);assert.equal(second.turn.action.kind,'none');
 assert.equal(recalledAgentTurns([first.memory],friend).length,0);
 assert.equal(recalledAgentTurns([first.memory],owner,'other-thread').length,0);
 assert.equal(recalledAgentTurns([{...first.memory,text:first.memory.text.replace('"kind":"split"','"kind":"unsupported"')}],owner).length,0);
});
test('provider or Walrus commit failure returns no executable proposal',async()=>{
 let writes=0;const p={text:'Split dinner',threadId,nonce,context:context(),generate:async()=>split(),remember:async()=>{writes++;return {blob_id:''};}};
 await assert.rejects(createAgentTurn({...p,generate:async()=>{throw Error('Gemini unavailable');}}),/Gemini unavailable/);assert.equal(writes,0);
 await assert.rejects(createAgentTurn(p),/did not commit/);assert.equal(writes,1);
 await assert.rejects(createAgentTurn({...p,remember:async()=>{throw Error('Walrus unavailable');}}),/Walrus unavailable/);
});
test('invalid intents persist clarification; invented contact addresses cannot become an action',async()=>{
 const p={text:'Add my friend',threadId,nonce,context:context(),generate:async()=>({action:'contact',handle:'New contact',wallet:address(6)}),remember:async()=>({blob_id:'test-blob'})};
 const result=await createAgentTurn(p);assert.equal(result.turn.action.kind,'none');assert.match(result.turn.reply,/cannot infer or invent/);
 const actual=await createAgentTurn({...p,text:'Add New contact '+address(6)});assert.equal(actual.turn.action.kind,'contact');
 const invalid=await createAgentTurn({...p,generate:async()=>split({amount:'no'})});assert.equal(invalid.turn.action.kind,'none');
});
test('lasting preferences are reviewable memory drafts and retain unspecified settings',()=>{
 const c=context();c.memories=[{blob_id:'rule',category:'social_split_trust',namespace:'test-only',text:'SOLVENCY_RULE_V1 '+JSON.stringify({subject:friend,upfrontAboveUsdc:70,excludeAlcohol:false,fundingPolicy:'never'})}];
 const a=prepareAgentAction({action:'preference',subject:'Casey',excludeAlcohol:true,threshold:null,policy:null},c).action;
 assert.equal(a.kind,'memory');if(a.kind==='memory')assert.deepEqual(a.payload,{action:'save_preference',subjectWallet:friend,upfrontAboveUsdc:70,excludeAlcohol:true,fundingPolicy:'never'});
 assert.equal(c.memories.length,1);
 const note=prepareAgentAction({action:'note',subject:'My actual financial reminder',category:'cashflow_elasticity'},c).action;
 assert.equal(note.kind,'memory');if(note.kind==='memory')assert.deepEqual(note.payload,{action:'remember',category:'cashflow_elasticity',text:'My actual financial reminder'});
 assert.throws(()=>prepareAgentAction({action:'note',subject:'A note',category:'invalid'},c));
 assert.throws(()=>prepareAgentAction({action:'note',subject:'SOLVENCY_RULE_V1 fabricated policy',category:'social_split_trust'},c),/cannot create payment proof/);
});
test('agent purchase records and 48-hour check-ins use actual data with explicit ratings',()=>{
 const c=context();const a=prepareAgentAction({action:'purchase',title:'User merchant',amount:'30.000001',category:'workspace',when:'now'},c).action;
 assert.equal(a.kind,'memory');if(a.kind==='memory')assert.equal(a.payload.purchasedAtMs,now);
 assert.throws(()=>prepareAgentAction({action:'purchase',title:'User merchant',amount:'30',category:'invalid',when:'now'},c));
 assert.throws(()=>prepareAgentAction({action:'checkin',ids:[nonce],verdict:'regretted',intensity:4},c),/48 hours/);
});
function service(){
 const c=context(),calls:string[]=[],writes:string[]=[];
 const client:ReturnType<MemoryDependencies['client']>={recall:async()=>{calls.push('recall');return {results:[],total:0};},rememberAndWait:async text=>{calls.push('commit');writes.push(text);return {id:'job',blob_id:'committed-test-blob',owner,namespace:'test-only'};},analyzeAndWait:async()=>({}) as never,restore:async()=>({}) as never};
 const deps:MemoryDependencies={state:async()=>c.profile,access:async()=>{calls.push('access');return {accountId:account,owner,active:true,delegateAuthorized:true,delegateCount:1};},client:()=>client,transaction:async()=>{throw Error('Unexpected transaction read');},object:async()=>{throw Error('Unexpected object read');},events:async()=>({data:[],hasNextPage:false,nextCursor:null}),agent:{generate:async()=>{calls.push('gemini');return split();},splits:async()=>[],vaults:async()=>[]}};
 return {deps,client,calls,writes};
}
test('signed agent endpoint requires owned MemWal access, recall, Gemini and a committed blob in order',async()=>{
 const {deps,calls,writes}=service();const result=await executeMemoryRequest(request,nonce,deps);
 assert.equal(result.status,'COMMITTED');assert.equal(result.agent?.action.kind,'split');assert.equal(result.createdMemories?.at(-1)?.blob_id,result.agent?.blobId);
 assert.equal(calls[0],'access');assert.ok(calls.indexOf('recall')<calls.indexOf('gemini'));assert.ok(calls.indexOf('gemini')<calls.indexOf('commit'));assert.equal(writes.length,1);assert.doesNotMatch(writes[0],/SOLVENCY_RULE_V1/);
 for(const failure of ['access','recall','gemini','commit']){
  const f=service();if(failure==='access')f.deps.access=async()=>{throw Error('Access revoked');};if(failure==='recall')f.client.recall=async()=>{throw Error('Recall failed');};if(failure==='gemini')f.deps.agent!.generate=async()=>{throw Error('Gemini failed');};if(failure==='commit')f.client.rememberAndWait=async()=>{throw Error('Commit failed');};
  await assert.rejects(executeMemoryRequest(request,nonce,f.deps));if(failure!=='commit')assert.equal(f.writes.length,0);if(['access','recall'].includes(failure))assert.ok(!f.calls.includes('gemini'));
 }
});
test('agent signatures bind text, conversation and timezone; secret-like messages are refused',()=>{
 assert.deepEqual(validatePayload(request),request);const e={payload:request,issuedAt:now,nonce,origin:'http://127.0.0.1:3000'};
 for(const change of [{text:'Another bill'},{threadId:'another-thread-0001'},{timeZone:'Asia/Kolkata'}])assert.notEqual(memorySigningMessage(e),memorySigningMessage({...e,payload:{...request,...change}}));
 for(const change of [{threadId:'short'},{text:''},{timeZone:'Mars/Orbit'},{text:'suiprivkey1private'}])assert.throws(()=>validatePayload({...request,...change}));
});
