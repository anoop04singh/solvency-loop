import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMemoryRequest,type MemoryDependencies} from '../src/lib/memory-service';
import {verifyRecalledSettlements} from '../src/lib/memory-evidence';
import {validatePayload,memorySigningMessage,type MemoryPayload,type RecalledMemory} from '../src/lib/memory-protocol';
import {CHECKIN_DELAY_MS,DAY_MS,type PurchaseMemory} from '../src/lib/financial-insights';
import {SUI_MAINNET_USDC_TYPE} from '../src/lib/config';
const owner='0x'+'1'.repeat(64),friend='0x'+'2'.repeat(64),account='0x'+'3'.repeat(64),split='0x'+'4'.repeat(64),digest='3'.repeat(44),nonce='test-request-nonce-0001';
process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=owner;process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=owner;
const now=Date.now(),purchase:PurchaseMemory={id:nonce,owner,merchant:'Actual test merchant',category:'workspace',amountUnits:'30000000',purchasedAtMs:now-3*DAY_MS,timeZone:'Asia/Kolkata',localHour:11,recordedAtMs:now-DAY_MS,checkpoint:'9',balanceUnits:'999000000'};
const mem=(marker:string,value:unknown,category:RecalledMemory['category']='habit_regret'):RecalledMemory=>({text:marker+' '+JSON.stringify(value),blob_id:'test-blob',namespace:'test-only',category});
function setup(){
 const writes:{wallet:string;category:string;accountId:string;text:string;key?:string}[]=[];
 let recalled:RecalledMemory[]=[mem('SOLVENCY_PURCHASE_V1',purchase)];
 const client:ReturnType<MemoryDependencies['client']>={recall:async()=>({results:recalled.map(m=>({...m,distance:.1})),total:recalled.length}),rememberAndWait:async()=>({id:'test-job',blob_id:'test-committed-blob',owner,namespace:'test-only'}),analyzeAndWait:async()=>({}) as never,restore:async()=>({failed:0,restored:0,total:0,skipped:0,truncated:false,namespace:'test-only',owner})};
 const deps:MemoryDependencies={
  state:async()=>({profileId:owner,wallet:owner,handle:'Test',memwalAccountId:account,safeFloorUsdc:20,contacts:[{handle:'Friend',walletAddress:friend}],usdcBalance:120.000001,suiBalance:1,latestCheckpoint:'123456',isRegisteredOnChain:true}),
  access:async(wallet,accountId)=>{assert.equal(wallet,owner);assert.equal(accountId,account);return {accountId,owner:wallet,active:true,delegateAuthorized:true,delegateCount:1};},
  client:(wallet,category,accountId)=>({...client,rememberAndWait:async(text,options)=>{writes.push({wallet,category,accountId,text,key:typeof options==='object'?options.idempotencyKey:undefined});return client.rememberAndWait(text,options);}}),
  transaction:(async()=>({effects:{status:{status:'success'}},checkpoint:'123',events:[{id:{txDigest:digest,eventSeq:'7'},type:owner+'::core::ShareSettledEvent',parsedJson:{payer:friend,recipient:owner,split_id:split,amount:'50000000',settled_at_ms:String(now-DAY_MS)}}]})) as unknown as MemoryDependencies['transaction'],
  object:(async()=>({data:{objectId:split,content:{dataType:'moveObject',type:owner+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>',fields:{id:{id:split},created_at_ms:String(now-15*DAY_MS)}}}})) as unknown as MemoryDependencies['object'],
  events:(async()=>({data:[],hasNextPage:false,nextCursor:null})) as unknown as MemoryDependencies['events']
 };
 return {deps,writes,client,setRecalled:(values:RecalledMemory[])=>{recalled=values;}};
}
test('purchase input validates precise amounts, timezone, rating and signs all new preference fields',()=>{
 const input:MemoryPayload={action:'record_purchase',walletAddress:owner,merchant:'Place',merchantCategory:'shopping',amountUsdc:'0.000001',purchasedAtMs:now,timeZone:'UTC'};
 assert.deepEqual(validatePayload(input),input);
 for(const change of [{amountUsdc:'0'},{amountUsdc:'1.0000001'},{timeZone:'Mars/Orbit'},{merchantCategory:'invalid'},{purchasedAtMs:1.5}])assert.throws(()=>validatePayload({...input,...change}));
 for(const change of [{intensity:6},{intensity:0},{purchaseId:'short'}])assert.throws(()=>validatePayload({action:'regret_checkin',walletAddress:owner,purchaseId:nonce,verdict:'regretted',intensity:3,...change}));
 const payload:MemoryPayload={action:'save_preference',walletAddress:owner,subjectWallet:friend,upfrontAboveUsdc:40,excludeAlcohol:true,fundingPolicy:'adaptive'};
 const envelope={payload,issuedAt:now,nonce,origin:'http://127.0.0.1:3000'};
 assert.notEqual(memorySigningMessage(envelope),memorySigningMessage({...envelope,payload:{...payload,excludeAlcohol:false}}));
});
test('purchase writes use the owned account, live balance checkpoint and actual committed blob',async()=>{
 const {deps,writes}=setup();
 const result=await executeMemoryRequest({action:'record_purchase',walletAddress:owner,merchant:purchase.merchant,merchantCategory:purchase.category,amountUsdc:'30.000001',purchasedAtMs:purchase.purchasedAtMs,timeZone:'Asia/Kolkata'},nonce,deps);
 assert.equal(result.status,'COMMITTED');assert.equal(result.createdMemories?.[0].blob_id,'test-committed-blob');
 assert.equal(writes[0].accountId,account);assert.equal(writes[0].category,'habit_regret');
 assert.match(writes[0].text,/"balanceUnits":"120000001"/);assert.match(writes[0].text,/"checkpoint":"123456"/);assert.match(writes[0].text,/"timeZone":"Asia\/Kolkata"/);
 assert.equal(writes[0].key,'purchase:'+nonce);
 await assert.rejects(executeMemoryRequest({action:'record_purchase',walletAddress:owner,merchant:'Future',merchantCategory:'other',amountUsdc:'1',purchasedAtMs:Date.now()+DAY_MS,timeZone:'UTC'},nonce,deps),/not a future/);
});
test('server enforces 48 hours and cannot rate a foreign or missing purchase',async()=>{
 const {deps,writes,setRecalled}=setup(),request:MemoryPayload={action:'regret_checkin',walletAddress:owner,purchaseId:nonce,verdict:'regretted',intensity:4};
 setRecalled([mem('SOLVENCY_PURCHASE_V1',{...purchase,purchasedAtMs:Date.now()-CHECKIN_DELAY_MS+60_000})]);
 await assert.rejects(executeMemoryRequest(request,nonce,deps),/not due/);assert.equal(writes.length,0);
 setRecalled([mem('SOLVENCY_PURCHASE_V1',{...purchase,owner:friend})]);
 await assert.rejects(executeMemoryRequest(request,nonce,deps),/could not be found/);assert.equal(writes.length,0);
});
test('due ratings commit both namespaces with original purchase context and live liquidity',async()=>{
 const {deps,writes}=setup();
 const result=await executeMemoryRequest({action:'regret_checkin',walletAddress:owner,purchaseId:nonce,verdict:'regretted',intensity:4},nonce,deps);
 assert.equal(result.createdMemories?.length,2);assert.deepEqual(writes.map(w=>w.category),['habit_regret','cashflow_elasticity']);
 assert.match(writes[0].text,/"localHour":11/);assert.match(writes[0].text,/"merchant":"Actual test merchant"/);
 assert.match(writes[1].text,/"balanceUnits":"120000001"/);assert.match(writes[1].text,/"floorUnits":"20000000"/);
 assert.ok(writes.every(w=>w.accountId===account&&w.wallet===owner));
});

test('a creator rates a bill without a purchase-memory write and the server obtains their exact share from Sui',async()=>{
 const {deps,writes}=setup();let cancelled=false,creator=owner,created=now-3*DAY_MS,type=owner+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>';
 deps.object=(async()=>({data:{objectId:split,content:{dataType:'moveObject',type,fields:{
  id:{id:split},creator,title:'[sl1:dining] Dinner',total_bill_amount:'10000000',creator_share:'3000001',created_at_ms:String(created),funding_deadline_ms:String(now+DAY_MS),is_active:true,is_cancelled:cancelled,pending_upfront:'0',
  participants:{contents:[{key:friend,value:{debtor:friend,amount_owed:'6999999',requires_upfront_escrow:false,is_funded:false,is_settled:false,settled_at_ms:'0'}}]},
 }}}})) as unknown as MemoryDependencies['object'];
 const request:MemoryPayload={action:'regret_checkin',walletAddress:owner,purchaseId:split.slice(2),splitId:split,timeZone:'UTC',verdict:'regretted',intensity:4};
 assert.equal(validatePayload(request),request);
 for(const change of [{purchaseId:nonce},{timeZone:'Mars/Orbit'},{timeZone:undefined}])assert.throws(()=>validatePayload({...request,...change}));
 for(const state of ['cancelled','foreign','early','token'] as const){
  cancelled=state==='cancelled';creator=state==='foreign'?friend:owner;created=state==='early'?now-DAY_MS:now-3*DAY_MS;type=owner+'::core::GroupSplitEscrow<'+(state==='token'?'0x2::sui::SUI':SUI_MAINNET_USDC_TYPE)+'>';
  await assert.rejects(executeMemoryRequest(request,nonce,deps));assert.equal(writes.length,0);
 }
 cancelled=false;creator=owner;created=now-3*DAY_MS;type=owner+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>';
 const result=await executeMemoryRequest({...request,amountUsdc:'999',purchasedAtMs:1},nonce,deps);
 assert.equal(result.createdMemories?.length,2);assert.deepEqual(writes.map(w=>w.category),['habit_regret','cashflow_elasticity']);
 const record=JSON.parse(writes[0].text.split('SOLVENCY_REGRET_V1 ')[1]);
 assert.equal(record.amountUnits,'3000001');assert.equal(record.merchant,'Dinner');assert.equal(record.category,'dining');assert.equal(record.purchasedAtMs,created);assert.equal(record.splitId,split);assert.equal(record.id,split.slice(2));
 assert.ok(writes.every(w=>w.accountId===account&&w.wallet===owner));assert.ok(writes.every(w=>!w.text.includes('SOLVENCY_PURCHASE_V1')));
});
test('partial check-in commits and failed decryption produce explicit failure',async()=>{
 const {deps,client}=setup(),original=deps.client;
 deps.client=(wallet,category,accountId)=>category==='cashflow_elasticity'?{...client,rememberAndWait:async()=>{throw new Error('relayer unavailable');}}:original(wallet,category,accountId);
 await assert.rejects(executeMemoryRequest({action:'regret_checkin',walletAddress:owner,purchaseId:nonce,verdict:'worth_it'},nonce,deps),/check-in was saved, but its cash-flow context/);
 deps.client=()=>({...client,recall:async()=>({results:[],total:1,dropped_count:1})});
 await assert.rejects(executeMemoryRequest({action:'regret_checkin',walletAddress:owner,purchaseId:nonce,verdict:'worth_it'},nonce,deps),/could not be decrypted/);
});
const observation=()=>mem('SOLVENCY_SETTLEMENT_V1',{subject:friend,recipient:owner,splitId:split,digest,eventSeq:'7',amountUnits:'50000000',lagMs:14*DAY_MS,settledAtMs:now-DAY_MS},'social_split_trust');
test('recalled settlements are deduped and independently verified against exact package events',async()=>{
 const {deps}=setup();const result=await verifyRecalledSettlements([observation(),observation()],owner,deps);
 assert.equal(result.verifiedSettlements.length,1);assert.equal(result.rejectedEvidenceCount,0);
 assert.equal(result.verifiedSettlements[0].lagMs,14*DAY_MS);assert.equal(result.verifiedSettlements[0].checkpoint,'123');
});
test('failed, wrong-token or mismatched settlement evidence never affects a rule',async()=>{
 for(const change of ['failure','token','amount','package','lag','foreign']){
  const {deps}=setup();let candidate=observation();const tx=await deps.transaction({digest,options:{showEvents:true,showEffects:true}});
  if(change==='failure')deps.transaction=(async()=>({...tx,effects:{status:{status:'failure'}}})) as unknown as MemoryDependencies['transaction'];
  if(change==='token')deps.object=(async()=>({data:{content:{dataType:'moveObject',type:owner+'::core::GroupSplitEscrow<0x2::sui::SUI>',fields:{created_at_ms:String(now-15*DAY_MS)}}}})) as unknown as MemoryDependencies['object'];
  if(change==='amount')candidate={...candidate,text:candidate.text.replace('"50000000"','"99000000"')};
  if(change==='package')deps.transaction=(async()=>({...tx,events:tx.events!.map(e=>({...e,type:friend+'::core::ShareSettledEvent'}))})) as unknown as MemoryDependencies['transaction'];
  if(change==='lag')candidate={...candidate,text:candidate.text.replace(String(14*DAY_MS),String(13*DAY_MS))};
  if(change==='foreign')candidate={...candidate,text:candidate.text.replace('"recipient":"'+owner,'"recipient":"'+friend)};
  assert.equal((await verifyRecalledSettlements([candidate],owner,deps)).verifiedSettlements.length,0,change);
 }
});
test('settlement verification propagates provider failures and bounds its read workload',async()=>{
 const {deps}=setup();deps.transaction=async()=>{throw new Error('Tatum busy');};
 await assert.rejects(verifyRecalledSettlements([observation()],owner,deps),/Tatum busy/);
 let reads=0;deps.transaction=(async()=>{reads++;return {effects:{status:{status:'failure'}},events:[]};}) as unknown as MemoryDependencies['transaction'];
 const candidates=Array.from({length:23},(_,i)=>({...observation(),text:observation().text.replace(digest,'3'.repeat(43)+'456789ABCDEFGHJKLMNPQRSTUV'[i])}));
 const result=await verifyRecalledSettlements(candidates,owner,deps);
 assert.equal(result.evidenceLimitReached,true);assert.equal(reads,20);assert.equal(result.rejectedEvidenceCount,20);
});
