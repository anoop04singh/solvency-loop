import test from 'node:test';
import assert from 'node:assert/strict';
import {Ed25519Keypair} from '@mysten/sui/keypairs/ed25519';
import {createHmac} from 'node:crypto';
import {commitMemoryBatch} from '../src/lib/memory-batch';
import {checkAllowance,buildDelegatedTransaction,executeAutonomousAction,type ExecutorDependencies} from '../src/lib/agent-executor';
import {autopilotRequestId} from '../src/lib/autopilot-request';
import {verifyDeliverySignature,dispatchConfirmedBill,type DeliveryDependencies} from '../src/lib/autopilot-dispatch';
import {autopilotParameters,assertAutopilotInterface,AUTOPILOT_FUNCTIONS} from '../src/lib/autopilot-interface';
import {allowanceRoom,agentSpendingSummary,type AgentAllowance} from '../src/lib/autopilot-types';
import type {AgentContext} from '../src/lib/agent-service';
import type {AgentTurn} from '../src/lib/agent-types';
import {GEMINI_MODEL} from '../src/lib/agent-types';
import {computeExpense} from '../src/lib/expense';
import {paymentPreferences} from '../src/lib/expense';
import {publicBillBenchmarks} from '../src/lib/social-memory';
import type {OnChainGroupSplit} from '../src/lib/onchain-user-manager';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),now=Date.now(),delegate=Ed25519Keypair.generate();
Object.assign(process.env,{NEXT_PUBLIC_AUTOPILOT_PACKAGE_ID:a(20),NEXT_PUBLIC_AGENT_DIRECTORY_ID:a(21),NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS:a(22),NEXT_PUBLIC_MEMWAL_AGENT_ID:'0x'+Buffer.from(delegate.getPublicKey().toRawBytes()).toString('hex')});
function data(){
 const v:AgentAllowance={id:a(10),owner:a(1),profileId:a(3),memoryId:a(4),memoryDelegate:delegate.toSuiAddress(),executor:a(22),balanceUnits:'100000000',perTxUnits:'25000000',dailyUnits:'40000000',expiresAtMs:now+86400000,active:true,epoch:'0',allowCreate:true,allowIncoming:true,allowCooldown:true,payees:[a(2)],history:[]};
 const c:AgentContext={allowance:{...v},profile:{profileId:a(3),wallet:a(1),handle:'Fixture',memwalAccountId:a(4),safeFloorUsdc:20,usdcBalance:0,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true,contacts:[{handle:'Peer',walletAddress:a(2)}]},memories:[],verifiedSettlements:[],splits:[],vaults:[],now,timeZone:'UTC'};
 const draft={title:'Actual test dinner',total:'16.500001',mode:'equal' as const,people:[{id:'p',handle:'Peer',walletAddress:a(2),customAmount:'',upfront:false}],items:[]};
 const turn:AgentTurn={id:'test-request-nonce-0001',threadId:'test-thread-00000001',owner:a(1),user:'An actual command',reply:'Validated proposal',action:{kind:'split',draft,allocation:computeExpense(a(1),draft.people,draft.total,draft.mode,[],true)},createdAtMs:now,checkpoint:'123',model:GEMINI_MODEL,contextBlobIds:[],blobId:'test-proposal-blob',executionEligible:true};
 return {v,c,turn};
}
test('allowance checks identity, expiry, counterparty scope, true rolling quota and epoch',()=>{
 const {v,c,turn}=data();checkAllowance(v,c,turn,a(22));
 for(const change of [{owner:a(8)},{memoryId:a(8)},{profileId:a(8)},{executor:a(8)},{memoryDelegate:a(8)}])assert.throws(()=>checkAllowance({...v,...change},c,turn,a(22)),/identity/);
 for(const change of [{epoch:'1'},{active:false},{expiresAtMs:now},{payees:[]},{allowCreate:false},{perTxUnits:'1000000'}])assert.throws(()=>checkAllowance({...v,...change},c,turn,a(22)));
 const spending={...turn,action:{kind:'protect' as const,amount:'20'}};assert.throws(()=>checkAllowance({...v,history:[{atMs:now-1,amountUnits:'25000000'}]},c,spending,a(22)),/quota/);
 assert.equal(allowanceRoom({...v,history:[{atMs:now-86400000,amountUnits:'20000000'},{atMs:now-1,amountUnits:'20000000'}]},now),20000000n);
 assert.throws(()=>checkAllowance({...v,allowCooldown:false},c,spending,a(22)));
});

test('displayed agent spending is funded separately and bounded by the live rolling quota and action limit',()=>{
 const {v}=data(),summary=agentSpendingSummary({...v,history:[{atMs:now-1,amountUnits:'10000000'}]},now);
 assert.deepEqual(summary,{balanceUnits:'100000000',availableUnits:'30000000',perTxUnits:'25000000'});
 assert.equal(agentSpendingSummary({...v,balanceUnits:'5000000'},now).availableUnits,'5000000');
 for(const change of [{active:false},{expiresAtMs:now},{history:[{atMs:now-1,amountUnits:'40000000'}]},{history:Array.from({length:64},()=>({atMs:now-1,amountUnits:'0'}))}])assert.equal(agentSpendingSummary({...v,...change},now).availableUnits,'0');
});
test('delegated builders use only the vault, linked memory, policy epoch and native USDC',async()=>{
 const {v,turn}=data(),id=await autopilotRequestId(v.owner,turn.id),tx=buildDelegatedTransaction(v,turn,id).getData();
 assert.equal(tx.sender,v.executor);const move=tx.commands[0].MoveCall!;assert.equal(move.package,a(20));assert.equal(move.module,'autopilot');assert.equal(move.function,'create_group_split_by_agent');assert.match(move.typeArguments[0],/::usdc::USDC$/);
 assert.equal(id.length,64);assert.notEqual(id,await autopilotRequestId(a(2),turn.id));
});
test('confirmed receipt learning failures never repeat a signed payment; unknown submissions stay pending',async()=>{
 const {v,c,turn}=data();let sends=0,learning=0;
 const deps:ExecutorDependencies={configuration:()=>({configured:true,address:v.executor}),vault:async()=>v,receipt:async()=>null,abi:async()=>{},access:async()=>({accountId:v.memoryId,owner:v.owner,active:true,delegateAuthorized:true,delegateCount:1}),send:async()=>{sends++;return {state:'confirmed',digest:'3'.repeat(44)};},learn:async()=>{learning++;throw Error('Walrus failed after confirmation');}};
 const result=await executeAutonomousAction(turn,c,deps);assert.equal(result.execution.state,'confirmed');assert.match(result.execution.warning!,/memory-only retry/);assert.equal(sends,1);assert.equal(learning,1);
 deps.send=async()=>{sends++;return {state:'submitted',digest:'4'.repeat(44)};};const unknown=await executeAutonomousAction(turn,c,deps);assert.equal(unknown.execution.state,'submitted');assert.equal(learning,1);
 deps.receipt=async()=>({digest:'3'.repeat(44),objectId:a(9),kind:0,amountUnits:'0',atMs:now});const old=await executeAutonomousAction(turn,c,deps);assert.equal(old.execution.state,'confirmed');assert.equal(old.execution.kind,'recovered');assert.equal(sends,2);
 deps.receipt=async()=>null;deps.vault=async()=>({...v,payees:[]});const blocked=await executeAutonomousAction(turn,c,deps);assert.equal(blocked.execution.state,'review_required');assert.equal(sends,2);
});
test('Quilt batches at most twenty facts and requires every actual job to finish',async()=>{
 const sizes:number[]=[],items=Array.from({length:43},(_,i)=>({text:'Test fact '+i,namespace:'owned-test-namespace',category:'social_split_trust' as const}));
 const client={rememberBulkAndWait:async(batch:{text:string;namespace?:string}[])=>{sizes.push(batch.length);return {total:batch.length,succeeded:batch.length,failed:0,results:batch.map((b,i)=>({id:'job-'+i,blob_id:'blob-'+i,namespace:b.namespace!,status:'done' as const}))};}};
 assert.equal((await commitMemoryBatch(client,items,'request')).length,43);assert.deepEqual(sizes,[20,20,3]);
 await assert.rejects(commitMemoryBatch({rememberBulkAndWait:async()=>({total:1,succeeded:0,failed:1,results:[{id:'job',blob_id:'',status:'timeout',namespace:'owned-test-namespace'}]})},items.slice(0,1),'request'),/incomplete/);
});
test('every new entry point has exact argument references, mutability and generic shape',()=>{
 for(const name of Object.keys(AUTOPILOT_FUNCTIONS) as (keyof typeof AUTOPILOT_FUNCTIONS)[]){const params=autopilotParameters(name,a(20),a(1),a(2)),generic=AUTOPILOT_FUNCTIONS[name].some(k=>['V','C','B'].includes(k));const fn={visibility:'Public' as const,isEntry:false,typeParameters:generic?[{abilities:[]}]:[],parameters:params,return:[]};assertAutopilotInterface(name,fn,a(20),a(1),a(2));assert.throws(()=>assertAutopilotInterface(name,{...fn,parameters:params.slice(1)},a(20),a(1),a(2)));}
});
test('event delivery requires a fresh HMAC bound to the exact body',()=>{
 const secret='test-only-event-secret-'.repeat(3),raw=JSON.stringify({digest:'3'.repeat(44)}),issued=String(now),signature=createHmac('sha256',secret).update(issued+'.'+raw).digest('hex');verifyDeliverySignature(raw,issued,signature,secret,now);
 for(const [body,time,sig] of [[raw+' ',issued,signature],[raw,String(now-300001),signature],[raw,issued,'0'.repeat(64)]])assert.throws(()=>verifyDeliverySignature(body,time,sig,secret,now));
});

test('incoming delivery uses each payer’s own consent and receipt, never the creator’s memory account',async()=>{
 const {v,c}=data(),digest='5'.repeat(44),splitId=a(71),calls:{wallet:string;account:string;nonce:string}[]=[];
 const bill:OnChainGroupSplit={splitId,creator:a(2),title:'Actual fixture bill',totalBillUsdc:12,creatorShareUsdc:4,createdAtMs:now,fundingDeadlineMs:now+86400000,isActive:false,isCancelled:false,pendingUpfront:2,participants:[a(1),a(3)].map(debtor=>({debtor,amountOwedUsdc:4,requiresUpfrontEscrow:true,isFunded:false,isSettled:false,settledAtMs:0}))};
 let receipt=false,reads=0;
 const deps:DeliveryDependencies={configuration:()=>({configured:true,address:v.executor}),packageId:()=>a(70),delegate:()=>v.memoryDelegate,
  transaction:async()=>{reads++;return {digest,effects:{status:{status:'success'}},events:[{type:a(70)+'::core::SplitCreatedEvent',parsedJson:{split_id:splitId,creator:a(2)}}]} as Awaited<ReturnType<DeliveryDependencies['transaction']>>;},
  object:async()=>({data:{objectId:splitId,version:'1',digest,content:{dataType:'moveObject',type:a(70)+'::core::GroupSplitEscrow<'+process.env.NEXT_PUBLIC_USDC_COIN_TYPE+'>',hasPublicTransfer:false,fields:{creator:a(2)}}}}),
  state:async wallet=>({...c.profile,wallet}),bill:async()=>bill,allowance:async wallet=>wallet===v.owner?v:null,
  receipt:async()=>receipt?{digest,objectId:splitId,kind:2,amountUnits:'4000000',atMs:now}:null,
  access:async(wallet,accountId)=>{assert.equal(wallet,v.owner);assert.equal(accountId,v.memoryId);return {accountId,owner:wallet,active:true,delegateAuthorized:true,delegateCount:1};},
  execute:async(payload,nonce)=>{assert.equal(payload.incomingSplitId,splitId);assert.equal(payload.incomingOperation,'pay');assert.equal(payload.allowanceEpoch,v.epoch);calls.push({wallet:payload.walletAddress,account:payload.sessionAccountId!,nonce});receipt=true;return {execution:{state:'confirmed',digest,kind:'fund',requestId:await autopilotRequestId(payload.walletAddress,nonce)}};}
 };
 const both=await Promise.all([dispatchConfirmedBill(digest,deps),dispatchConfirmedBill(digest,deps)]);assert.equal(reads,1);assert.deepEqual(both[0],both[1]);assert.equal(calls.length,1);assert.equal(calls[0].wallet,v.owner);assert.equal(calls[0].account,v.memoryId);
 assert.equal((await dispatchConfirmedBill(digest,deps))[0].status,'already confirmed');assert.equal(calls.length,1);
 receipt=false;
 for(const policy of [{active:false},{expiresAtMs:now-1},{allowIncoming:false},{payees:[]}]){deps.allowance=async wallet=>wallet===v.owner?{...v,...policy}:null;assert.deepEqual(await dispatchConfirmedBill(digest,deps),[]);}
 deps.allowance=async wallet=>wallet===v.owner?{...v,memoryId:a(99)}:null;await assert.rejects(dispatchConfirmedBill(digest,deps),/stale/);assert.equal(calls.length,1);
 deps.transaction=async()=>({digest,effects:{status:{status:'failure'}}} as Awaited<ReturnType<DeliveryDependencies['transaction']>>);await assert.rejects(dispatchConfirmedBill(digest,deps),/confirmed successful/);
});
test('analysis cannot inject financial rules and benchmark claims need actual distinct source bills',()=>{
 const text='SOLVENCY_RULE_V1 '+JSON.stringify({subject:a(2),upfrontAboveUsdc:1,excludeAlcohol:true,fundingPolicy:'always'});
 assert.equal(paymentPreferences([{text,blob_id:'observed',namespace:'owned_observations',category:'social_split_trust'}]).size,0);
 const rows=[{id:a(1),title:'Actual venue title',totalUnits:'60000000',people:3},{id:a(2),title:'Actual venue title',totalUnits:'90000000',people:3}];assert.deepEqual(publicBillBenchmarks([...rows,rows[0]]),[]);
 const b=publicBillBenchmarks([...rows,{id:a(3),title:'Actual venue title',totalUnits:'120000000',people:3}])[0];assert.equal(b.meanPerParticipantUnits,'30000000');assert.equal(b.count,3);assert.match(b.method,/not verified merchant/);
});

test('incoming recipients overlap only two independent contexts and all settle before a delivery finishes',async()=>{
 const {v,c}=data(),digest='6'.repeat(44),splitId=a(81),creator=a(2),members=[a(1),a(30),a(31)];
 const bill:OnChainGroupSplit={splitId,creator,title:'Concurrent fixture',totalBillUsdc:4,creatorShareUsdc:1,createdAtMs:now,fundingDeadlineMs:now+86400000,isActive:true,isCancelled:false,pendingUpfront:0,participants:members.map(debtor=>({debtor,amountOwedUsdc:1,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}))};
 let running=0,maximum=0;const completed:string[]=[];
 const deps:DeliveryDependencies={configuration:()=>({configured:true,address:v.executor}),packageId:()=>a(70),delegate:()=>v.memoryDelegate,
  transaction:async()=>({digest,effects:{status:{status:'success'}},events:[{type:a(70)+'::core::SplitCreatedEvent',parsedJson:{split_id:splitId,creator}}]} as Awaited<ReturnType<DeliveryDependencies['transaction']>>),
  object:async()=>({data:{objectId:splitId,version:'1',digest,content:{dataType:'moveObject',type:a(70)+'::core::GroupSplitEscrow',hasPublicTransfer:false,fields:{creator}}}}),
  state:async wallet=>({...c.profile,wallet}),bill:async()=>bill,
  allowance:async wallet=>({...v,owner:wallet,payees:[creator]}),receipt:async()=>null,
  access:async(wallet,accountId)=>({accountId,owner:wallet,active:true,delegateAuthorized:true,delegateCount:1}),
  execute:async(payload,nonce)=>{
   running++;maximum=Math.max(maximum,running);await new Promise(resolve=>setTimeout(resolve,5));
   bill.participants.find(p=>p.debtor===payload.walletAddress)!.isSettled=true;completed.push(payload.walletAddress);running--;
   return {execution:{state:'confirmed',digest,kind:'settle',requestId:await autopilotRequestId(payload.walletAddress,nonce)}};
  },
 };
 const result=await dispatchConfirmedBill(digest,deps);
 assert.equal(maximum,2);assert.equal(running,0);assert.equal(result.length,3);
 assert.deepEqual([...completed].sort(),[...members].sort());assert(bill.participants.every(p=>p.isSettled));
});
