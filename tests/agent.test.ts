import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentTurn,prepareAgentAction,type AgentContext} from '../src/lib/agent-service';
import {GEMINI_MODEL,isAgentAction,recalledAgentTurns} from '../src/lib/agent-types';
import {executeMemoryRequest,type MemoryDependencies} from '../src/lib/memory-service';
import {validatePayload,memorySigningMessage,type MemoryPayload} from '../src/lib/memory-protocol';
import {DAY_MS} from '../src/lib/financial-insights';
import {LEARNED_MARKER,learnedNamespace,latestLearnedPreferences,selectLearningChoices} from '../src/lib/agent-learning';
import {decodeBillTitle,encodeBillTitle,recentBillCategories} from '../src/lib/bill-category';
import {bindSplitContact,prepareContinuedSplit} from '../src/lib/split-continuation';
const address=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const owner=address(1),friend=address(2),account=address(4),threadId='test-thread-00000001',nonce='test-agent-nonce-0001';
const now=Date.now();
process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=address(10);process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=address(11);
function context():AgentContext {return {profile:{profileId:address(3),wallet:owner,handle:'Test owner',contacts:[{handle:'Casey',walletAddress:friend}],memwalAccountId:account,safeFloorUsdc:20,usdcBalance:200.000001,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true},memories:[],verifiedSettlements:[],splits:[],vaults:[],now,timeZone:'UTC'};}
const split=(change:Record<string,unknown>={})=>({action:'split',title:'User supplied dinner',currency:'USDC',amount:'16.500001',includeCreator:true,people:[{contact:'Casey',amount:null,upfront:false,excludeAlcohol:false}],items:[],...change});
const request:MemoryPayload={action:'agent_chat',walletAddress:owner,text:'Share my dinner with Casey',threadId,timeZone:'UTC'};
test('reviewed bill categories survive chain encoding and rank recent actual history',()=>{
 const action=prepareAgentAction(split({billCategory:'travel'}),context()).action;
 assert.equal(action.kind,'split');
 if(action.kind!=='split')return;
 const stored=encodeBillTitle(action.draft.title,action.draft.category);
 assert.deepEqual(decodeBillTitle(stored),{title:action.draft.title,category:'travel'});
 assert.deepEqual(decodeBillTitle('Legacy dinner'),{title:'Legacy dinner'});
 assert.deepEqual(decodeBillTitle(encodeBillTitle('[sl1:travel] ordinary title')),{title:'[sl1:travel] ordinary title'});
 assert.throws(()=>encodeBillTitle('é'.repeat(60),'travel'),/120-byte/);
 assert.deepEqual(recentBillCategories([
  {...decodeBillTitle(stored),createdAtMs:3,isCancelled:false},
  {title:'Legacy dinner',createdAtMs:2,isCancelled:false},
  {title:'Pizza lunch',createdAtMs:1,isCancelled:false},
  {title:'Rent',createdAtMs:4,isCancelled:true},
 ]),['dining','travel']);
});
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
test('recent tab context produces a reply with no Walrus conversation record',async()=>{
 const c=context(),p={text:'Share dinner with Casey',threadId,nonce,context:c,generate:async()=>split()};
 const first=await createAgentTurn(p);
 assert.equal(first.turn.model,GEMINI_MODEL);assert.equal(first.turn.blobId,'');
 const archived={blob_id:'legacy-blob',text:'SOLVENCY_AGENT_V1 '+JSON.stringify(first.turn),namespace:'test-only',category:'social_split_trust' as const};
 c.memories=[archived];
 const conversation=[{user:p.text,reply:first.turn.reply}];
 const second=await createAgentTurn({...p,text:'Use that same bill',conversation,generate:async(value)=>{
  const input=value as {conversation:unknown[];memory:unknown[]};
  assert.deepEqual(input.conversation,conversation);assert.deepEqual(input.memory,[]);
  return {action:'explain',reply:'The proposal is ready for review.'};
 }});
 assert.equal(second.turn.action.kind,'none');assert.equal(second.turn.blobId,'');
 assert.equal(recalledAgentTurns([archived],owner).length,1);
 assert.equal(recalledAgentTurns([archived],friend).length,0);
 assert.equal(recalledAgentTurns([archived],owner,'other-thread').length,0);
});
test('invalid intents return clarification and reject invented contact addresses',async()=>{
 const p={text:'Add my friend',threadId,nonce,context:context(),generate:async()=>({action:'contact',handle:'New contact',wallet:address(6)})};
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
 const client:ReturnType<MemoryDependencies['client']>={recall:async()=>{calls.push('recall');return {results:[],total:0};},rememberAndWait:async text=>{calls.push('commit');writes.push(text);return {id:'job',blob_id:'committed-test-blob',owner,namespace:'test-only'};},rememberBulkAndWait:async items=>{calls.push('commit');writes.push(...items.map(i=>i.text));return {total:items.length,succeeded:items.length,failed:0,results:items.map(i=>({id:'job',blob_id:'committed-test-blob',namespace:i.namespace!,status:'done' as const}))};},analyzeAndWait:async()=>({results:[],total:0,succeeded:0,failed:0,facts:[],owner}),restore:async()=>({}) as never};
 const deps:MemoryDependencies={state:async()=>c.profile,access:async()=>{calls.push('access');return {accountId:account,owner,active:true,delegateAuthorized:true,delegateCount:1};},client:()=>client,transaction:async()=>{throw Error('Unexpected transaction read');},object:async()=>{throw Error('Unexpected object read');},events:async()=>({data:[],hasNextPage:false,nextCursor:null}),agent:{generate:async()=>{calls.push('gemini');return split();},splits:async()=>[],vaults:async()=>[]}};
 return {deps,client,calls,writes,c};
}
test('signed ordinary chat recalls owned memory without writes or event imports',async()=>{
 const {deps,calls,writes,client}=service();
 client.analyzeAndWait=async()=>{throw Error('Chat text must not be analyzed by MemWal');};
 deps.events=async()=>{throw Error('Chat must not run settlement import');};
 const result=await executeMemoryRequest(request,nonce,deps);
 assert.equal(result.status,'READY');assert.equal(result.agent?.action.kind,'split');assert.equal(result.agent?.blobId,'');assert.deepEqual(result.createdMemories,[]);
 assert.equal(calls[0],'access');assert.ok(calls.indexOf('recall')<calls.indexOf('gemini'));assert.deepEqual(writes,[]);
 for(const failure of ['access','recall','gemini']){
  const f=service();if(failure==='access')f.deps.access=async()=>{throw Error('Access revoked');};if(failure==='recall')f.client.recall=async()=>{throw Error('Recall failed');};if(failure==='gemini')f.deps.agent!.generate=async()=>{throw Error('Gemini failed');};
  await assert.rejects(executeMemoryRequest(request,nonce,f.deps));assert.equal(f.writes.length,0);if(['access','recall'].includes(failure))assert.ok(!f.calls.includes('gemini'));
 }
});
test('pending splits are read from Sui without calling Gemini or creating a Walrus client',async()=>{
 const f=service();
 f.deps.client=()=>{throw Error('A pending-split lookup should not touch Walrus');};
 f.deps.agent!.generate=async()=>{throw Error('A pending-split lookup should not use Gemini');};
 f.deps.agent!.splits=async()=>[{splitId:address(6),creator:friend,title:'Train fare',totalBillUsdc:1,creatorShareUsdc:0.5,createdAtMs:now-1,fundingDeadlineMs:now+60_000,isActive:true,isCancelled:false,pendingUpfront:0,participants:[{debtor:owner,amountOwedUsdc:0.5,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}]}];
 const result=await executeMemoryRequest({...request,text:'What are my pending splits?',autoMemory:true,autoExecute:true,allowanceEpoch:'0'},nonce,f.deps,{background:{expiresAt:now+60_000,schedule:()=>{throw Error('Read-only queries should never schedule writes');}}});
 assert.deepEqual(f.calls,['access']);
 assert.equal(result.agent?.action.kind,'none');
 assert.match(result.agent!.reply,/Train fare · Your share is 0\.50 USDC · unpaid/);
 assert.deepEqual(result.createdMemories,[]);
 assert.equal(result.memories,undefined);
});
test('a status question cannot enter automatic execution even if Gemini outputs execute',async()=>{
 const f=service();
 f.deps.agent!.generate=async()=>split({executionMode:'execute'});
 f.deps.autonomy=async()=>{throw Error('A question cannot enter funded execution');};
 const result=await executeMemoryRequest({...request,text:'What would my dinner split look like?',autoMemory:true,autoExecute:true,allowanceEpoch:'0'},nonce,f.deps);
 assert.equal(result.agent?.executionEligible,false);
 assert.equal(result.execution,undefined);
 assert.deepEqual(f.writes,[]);
});
test('a split keeps its amount through contact confirmation and category follow-ups without writing a transcript',async()=>{
 const f=service(),newWallet=address(6),tasks:(()=>Promise<void>)[]=[];
 f.deps.agent!.generate=async()=>({action:'clarify',reply:'Who should be included?'});
 const options={background:{expiresAt:Date.now()+60_000,schedule:(task:()=>Promise<void>)=>tasks.push(task)}};
 const chat={...request,autoMemory:true};
 const first=await executeMemoryRequest({...chat,text:'split 0.5 between me and snoop'},nonce,f.deps,options);
 assert.deepEqual(first.agent?.pendingSplit,{amount:'0.5',people:['snoop'],title:'Shared expense',category:'other'});
 assert.match(first.agent!.reply,/full Sui wallet address for snoop/);
 f.deps.agent!.generate=async()=>{throw Error('These follow-ups should use the typed draft');};
 const second=await executeMemoryRequest({...chat,text:newWallet,pendingSplit:first.agent!.pendingSplit},'test-agent-nonce-0002',f.deps,options);
 assert.deepEqual(second.agent?.action,{kind:'contact',handle:'snoop',walletAddress:newWallet});
 assert.equal(second.agent?.executionEligible,false);
 const pending=bindSplitContact(second.agent!.pendingSplit!,'snoop',newWallet);
 assert.equal(prepareContinuedSplit(pending,f.c).action.kind,'none');
 f.c.profile.contacts.push({handle:'snoop',walletAddress:newWallet});
 const resumed=prepareContinuedSplit(pending,f.c).action;
 assert.equal(resumed.kind,'split');
 if(resumed.kind==='split'){
  assert.equal(resumed.allocation.creatorShare,0.25);
  assert.equal(resumed.allocation.shares[0].amountUsdc,0.25);
 }
 const prompted=await executeMemoryRequest({...chat,text:'Make the split',pendingSplit:pending},'test-agent-nonce-0003',f.deps,options);
 assert.equal(prompted.agent?.action.kind,'split');
 const categorized=await executeMemoryRequest({...chat,text:'Travel',pendingSplit:prompted.agent?.pendingSplit},'test-agent-nonce-0004',f.deps,options);
 const action=categorized.agent?.action;
 assert.equal(action?.kind,'split');
 if(action?.kind==='split'){assert.equal(action.draft.category,'travel');assert.equal(action.draft.total,'0.5');assert.equal(action.draft.people[0].walletAddress,newWallet);}
 assert.equal(categorized.agent?.executionEligible,false);
 assert.deepEqual(f.writes,[]);
 assert.deepEqual(tasks,[]);
 assert.throws(()=>validatePayload({...chat,pendingSplit:pending,autoExecute:true,allowanceEpoch:'0'}),/pending split/);
});
test('agent signatures bind text, conversation and timezone; secret-like messages are refused',()=>{
 assert.deepEqual(validatePayload(request),request);const e={payload:request,issuedAt:now,nonce,origin:'http://127.0.0.1:3000'};
 for(const change of [{text:'Another bill'},{threadId:'another-thread-0001'},{timeZone:'Asia/Kolkata'},{conversation:[{user:'Earlier message',reply:'Earlier reply'}]}])assert.notEqual(memorySigningMessage(e),memorySigningMessage({...e,payload:{...request,...change}}));
 for(const change of [{threadId:'short'},{text:''},{timeZone:'Mars/Orbit'},{text:'suiprivkey1private'}])assert.throws(()=>validatePayload({...request,...change}));
});

test('funded execution requires a confirmed audit while previews have no write',async()=>{
 const run=async(mode:string,fail=false)=>{
  const f=service();let executed=0;
  f.deps.agent!.allowance=async()=>({id:address(10),owner,profileId:f.c.profile.profileId,memoryId:account,memoryDelegate:address(11),executor:address(12),epoch:'0',balanceUnits:'100000000',perTxUnits:'25000000',dailyUnits:'40000000',active:true,expiresAtMs:now+86400000,allowCreate:true,allowIncoming:true,allowCooldown:true,payees:[friend],history:[]});
  f.deps.agent!.generate=async()=>{f.calls.push('gemini');return {...split(),executionMode:mode};};
  f.client.analyzeAndWait=async()=>{throw Error('Raw chat must never be extracted');};
  f.deps.autonomy=async turn=>{
   executed++;assert.ok(f.calls.indexOf('commit')>f.calls.indexOf('gemini'));assert.equal(turn.blobId,'committed-test-blob');
   return {execution:{state:'confirmed',digest:'3'.repeat(44),requestId:'1'.repeat(64),kind:turn.action.kind},memories:[]};
  };
  if(fail)f.client.rememberBulkAndWait=async()=>{throw Error('Audit failed');};
  const pending=executeMemoryRequest({...request,autoExecute:true,allowanceEpoch:'0'},nonce,f.deps);
  if(fail){await assert.rejects(pending,/Audit failed/);assert.equal(executed,0);return;}
  const r=await pending,expected=mode==='execute'?1:0;
  assert.equal(executed,expected);assert.equal(f.writes.length,expected);assert.equal(!!r.execution,expected===1);
  if(expected){assert.match(f.writes[0],/^SOLVENCY_AGENT_AUDIT_V1 /);assert.ok(!f.writes[0].includes(request.text!));}
 };
 await run('execute');await run('prepare');await run('execute',true);
});

test('automatic purchase writes retain valid identifiers for later 48-hour learning',async()=>{
 const f=service();f.deps.agent!.generate=async()=>({action:'purchase',executionMode:'execute',title:'User supplied merchant',amount:'3.000001',category:'workspace',when:'now'});
 const result=await executeMemoryRequest({...request,text:'Record my 3.000001 USDC purchase at User supplied merchant now',autoMemory:true},nonce,f.deps);assert.equal(result.agentMemorySaved,true);const purchase=result.createdMemories?.find(m=>m.text.includes('SOLVENCY_PURCHASE_V1'));assert.ok(purchase);const record=JSON.parse(purchase.text.split('SOLVENCY_PURCHASE_V1 ')[1]);assert.match(record.id,/^[a-f0-9]{64}$/);assert.equal(record.owner,owner);
});

test('Quiet Memory queues only grounded standing preferences and skips repeats or revoked grants',async()=>{
 const f=service(),message='Always categorize North Market as groceries';
 const entry={kind:'bill_category',topic:'north market',value:'groceries',evidence:message};
 const namespace=learnedNamespace(owner),pending:(()=>Promise<void>)[]=[];
 f.deps.agent!.generate=async()=>({action:'explain',reply:'Understood.',memoryCandidates:[entry]});
 f.client.recall=async params=>{
  const results=typeof params==='object'&&params.namespace===namespace?f.writes.map((text,i)=>({blob_id:'blob-'+i,text,distance:0,created_at:new Date().toISOString()})):[];
  return {results,total:results.length};
 };
 const chat={...request,text:message,autoMemory:true};
 const work={issuedAt:now,background:{expiresAt:Date.now()+10_000,schedule:(task:()=>Promise<void>)=>pending.push(task)}};
 const first=await executeMemoryRequest(chat,nonce,f.deps,work);
 assert.equal(first.status,'READY');assert.equal(first.agentMemorySaved,false);assert.deepEqual(f.writes,[]);assert.equal(pending.length,1);
 await pending.shift()!();
 assert.equal(f.writes.length,1);
 assert.match(f.writes[0],new RegExp('^'+LEARNED_MARKER+' '));
 assert.doesNotMatch(f.writes[0],/Always categorize|Understood/);
 await executeMemoryRequest(chat,nonce,f.deps,work);
 await pending.shift()!();
 assert.equal(f.writes.length,1);
 await executeMemoryRequest({...chat,autoMemory:false},nonce,f.deps,work);
 assert.equal(pending.length,0);
 await executeMemoryRequest(chat,nonce,f.deps,{...work,background:{...work.background,expiresAt:0}});
 await pending.shift()!();
 assert.equal(f.writes.length,1);
 await executeMemoryRequest(chat,nonce,f.deps,work);
 const access=f.deps.access;
 f.deps.access=async()=>{throw Error('Delegate revoked');};
 const warn=console.warn;
 try{console.warn=()=>{};await pending.shift()!();}
 finally{console.warn=warn;f.deps.access=access;}
 assert.equal(f.writes.length,1);
 const update=await executeMemoryRequest({action:'edit_learning',walletAddress:owner,learningChoice:{kind:'bill_category',topic:'north market',value:null}},'test-agent-nonce-0002',f.deps,{issuedAt:now+1});
 assert.equal(update.createdMemories?.length,1);
 const results=f.writes.map((text,i)=>({blob_id:'blob-'+i,text,namespace,category:'social_split_trust' as const}));
 assert.equal(latestLearnedPreferences(results,owner)[0].value,null);
 const loaded=await executeMemoryRequest({action:'recall_learning',walletAddress:owner},nonce,f.deps);
 assert.equal(latestLearnedPreferences(loaded.learnedMemories!,owner)[0].value,null);
 assert.deepEqual(latestLearnedPreferences(results,friend),[]);
 await executeMemoryRequest(chat,nonce,f.deps,work);
 await pending.shift()!();
 assert.equal(f.writes.length,2);
});

test('passive learning rejects ungrounded, one-off or conflicting directives',()=>{
 const evidence='I prefer to split dinner equally';
 const choice={kind:'split_style',topic:'dinner',value:'equal',evidence};
 assert.deepEqual(selectLearningChoices([choice],evidence),[{kind:'split_style',topic:'dinner',value:'equal'}]);
 for(const message of ['I split dinner equally yesterday','If '+evidence,'Someone said '+evidence,'“'+evidence+'”','Do you think '+evidence+'?']){
  assert.deepEqual(selectLearningChoices([choice],message),[]);
 }
 assert.deepEqual(selectLearningChoices([{...choice,value:'always'}],evidence),[]);
});

test('shared preferences and unanimously approved group ratios affect exact allocations',()=>{
 const c=context();c.publicPreferences=[{id:address(20),owner:friend,active:true,excludeAlcohol:true,vegetarian:false,updatedAtMs:now}];
 const a=prepareAgentAction(split({amount:'16.50',items:[{label:'Food',kind:'food',amount:'11.50',people:[]},{label:'Drinks',kind:'alcohol',amount:'5',people:[]}]}),c).action;
 assert.equal(a.kind,'split');if(a.kind==='split')assert.equal(a.allocation.shares[0].amountUsdc,5.75);
 c.groups=[{id:address(21),creator:owner,title:'Utilities',updatedAtMs:now,members:[{wallet:owner,weight:4000,approved:true},{wallet:friend,weight:6000,approved:false}]}];assert.throws(()=>prepareAgentAction(split({groupId:address(21)}),c),/awaits consent/);c.groups[0].members[1].approved=true;
 const b=prepareAgentAction(split({groupId:address(21)}),c).action;assert.equal(b.kind,'split');if(b.kind==='split'){assert.equal(b.draft.conventionId,address(21));assert.equal(b.allocation.shares[0].amountUsdc,9.9);assert.equal(b.allocation.creatorShare,6.600001);}
});
