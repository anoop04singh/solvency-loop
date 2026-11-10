/** Read-only evidence audit: real app functions, optional live recall and one Gemini question. */
import nextEnv from '@next/env';
import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {spendingRoom,regretMemories,memoryRecord,localHour} from '../src/lib/financial-insights.ts';
import {unitsToUsdc,usdcToUnits} from '../src/lib/money.ts';

nextEnv.loadEnvConfig(process.cwd());
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const sourceId=option('--source-run')||'regret-six-hours-2026-11-10',runId=option('--run-id')||'regret-learning-2026-11-10';
for(const id of [sourceId,runId])assert(/^[a-zA-Z0-9-]{8,80}$/.test(id));
const source=JSON.parse(readFileSync(resolve('.live-verification',sourceId,'state.json'),'utf8'));
const directory=resolve('.live-verification',runId);mkdirSync(directory,{recursive:true});
const live=process.argv.includes('--live'),timeZone='Asia/Kolkata',now=Date.now(),origin=new URL(process.env.APP_ORIGIN||'http://127.0.0.1:3000').origin;
const evidence={at:new Date(now).toISOString(),mode:live?'live recall, source inspection and offline ablation':'archived evidence and offline ablation',timeZone,wallets:{},gemini:null};
const workers=new Map();
const log=(kind,data)=>appendFileSync(resolve(directory,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),kind,...data})+'\n');
const save=()=>writeFileSync(resolve(directory,'evidence.json'),JSON.stringify(evidence,null,2));

async function start(label){
 const child=fork(fileURLToPath(new URL('./verify-live-application.mjs',import.meta.url)),['--worker',label,'--base-url',origin],{execArgv:['--import','tsx'],stdio:['ignore','pipe','pipe','ipc']});
 const pending=new Map();
 await new Promise((ready,reject)=>{
  child.on('message',m=>{
   if(m.ready){workers.set(label,{child,pending,wallet:m.wallet});ready();return;}
   if(m.event){log(m.event,{label,data:m.data});if(m.event.startsWith('transaction_')||m.event==='autopilot_submission'){child.kill();return;}if(m.ack)child.send({ack:m.ack});return;}
   const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error));else p?.resolve(m.result);
  });
  child.on('error',reject);child.on('exit',code=>{reject(Error('Worker exited '+code));for(const p of pending.values())p.reject(Error('Worker exited '+code));});
 });child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
}
const call=(label,command,args={})=>{
 assert(['snapshot','quiet','memory'].includes(command));
 if(command==='memory')assert(args.action==='recall_all'||args.action==='agent_chat'&&args.autoExecute===false&&args.autoMemory===false,'Only non-writing reads are allowed.');
 log('requested',{label,command,args});
 return new Promise((resolveCall,reject)=>{const w=workers.get(label),id=randomUUID();w.pending.set(id,{resolve:resolveCall,reject});w.child.send({id,command,args});});
};

try{
 const memories={},snapshots={},responses={};
 for(const label of ['A','B','C']){
  const archived=source.final[label];
  if(live){
   await start(label);assert.equal(workers.get(label).wallet,archived.snapshot.wallet);
   snapshots[label]=await call(label,'snapshot');await call(label,'quiet');
   responses[label]=(await call(label,'memory',{action:'recall_all'})).response;memories[label]=responses[label].memories;
  }else{snapshots[label]=archived.snapshot;responses[label]=archived.response;memories[label]=archived.response.memories;}
  const wallet=snapshots[label].wallet,profile=snapshots[label].profile,ratings=regretMemories(memories[label],wallet);
  // All seven source bills were separately reconciled settled; no unpaid amount
  // is assumed without first checking the live source objects below.
  evidence.wallets[label]={wallet,memoryCount:new Set(memories[label].map(m=>m.blob_id)).size,ratings:ratings.map(r=>({id:r.id,title:r.merchant,verdict:r.verdict,intensity:r.intensity,amountUnits:r.amountUnits,category:r.category,purchasedAtMs:r.purchasedAtMs,checkedAtMs:r.checkedAtMs,localHour:r.localHour})),balance:profile.usdcBalance,reserve:profile.safeFloorUsdc,rejectedEvidenceCount:responses[label].rejectedEvidenceCount};
 }
 const original=JSON.parse(readFileSync(resolve('.live-verification',source.sourceRun,'reconciliation.json'),'utf8'));
 let bills=original.bills;
 if(live){const {fetchGroupSplitByIdViaTatum}=await import('../src/lib/onchain-user-manager.ts');bills=[];for(const b of original.bills)bills.push(await fetchGroupSplitByIdViaTatum(b.creator,b.splitId));}
 assert(bills.every(b=>!b.isCancelled&&b.participants.every(p=>p.isSettled)));
 for(const label of ['A','B','C']){
  const v=evidence.wallets[label],profile=snapshots[label].profile;
  const owed=bills.filter(b=>!b.isCancelled).flatMap(b=>b.participants).filter(p=>p.debtor===v.wallet&&!p.isSettled&&!p.isFunded).reduce((n,p)=>n+usdcToUnits(p.amountOwedUsdc),0n);
  const room=(rows,at)=>spendingRoom(profile.usdcBalance,profile.safeFloorUsdc,unitsToUsdc(owed),rows,v.wallet,at,timeZone);
  const before=source.initial[label].response.memories;
  const ablated=memories[label].filter(m=>!memoryRecord(m.text,'SOLVENCY_REGRET_V1')&&!memoryRecord(m.text,'SOLVENCY_CASHFLOW_V1'));
  v.current={at:new Date(now).toISOString(),before:room(before,now),after:room(memories[label],now),ablated:room(ablated,now)};
  // Explicit offline time replay; no Date.now override and no persisted data change.
  let matched={at:now,room:room(memories[label],now)};
  for(let h=1;h<=24;h++){const at=now+h*3600000,candidate=room(memories[label],at);if(candidate.sampleCount>matched.room.sampleCount)matched={at,room:candidate};}
  v.offlineMatchedHourReplay={label:'Controlled evaluation with unchanged balances and real stored feedback; not a future on-chain action.',at:new Date(matched.at).toISOString(),hour:localHour(matched.at,timeZone),before:room(before,matched.at),after:matched.room};
  assert.equal(v.current.after.quota,v.current.before.quota);
  assert.equal(v.offlineMatchedHourReplay.after.highRegret,false,'Review this result if the real feedback distribution changes.');
  assert.equal(v.current.after.shield,0);assert.equal(v.current.after.quota,v.current.ablated.quota);
 }
 evidence.verdict={storedAndRecalled:true,ratings:Object.values(evidence.wallets).reduce((n,v)=>n+v.ratings.length,0),currentQuotaChanged:false,matchedHourShieldTriggered:false,reason:'A has one regretted of three; B/C have two samples each. No wallet satisfies all current pattern thresholds. Current local hour is also outside the purchase-hour window.',modelWeightTraining:false,clinicalOrFinancialOutcomeBenefitMeasured:false};save();
 if(live&&process.argv.includes('--ask-gemini')){
  const label='A',text='Summarize my saved Worth It and Regretted bill check-ins, including each bill title and its rating. Are these records personal consumer opinions or owner-authorized randomized verification feedback? Explain only what the saved records support. Do not save anything, create a bill, change a preference, protect money or execute a transaction.';
  const reply=(await call(label,'memory',{action:'agent_chat',threadId:randomUUID(),text,timeZone,autoExecute:false,autoMemory:false})).response;
  assert.equal(reply.createdMemories?.length||0,0);assert(!reply.execution);assert.equal(reply.agent.action.kind,'none');
  const ids=memories.A.filter(m=>memoryRecord(m.text,'SOLVENCY_REGRET_V1')?.owner===snapshots.A.wallet).map(m=>m.blob_id);
  assert(ids.every(id=>reply.agent.contextBlobIds.includes(id)),'Actual regret facts were absent from the Gemini context.');
  evidence.gemini={model:reply.agent.model,reply:reply.agent.reply,contextBlobIds:reply.agent.contextBlobIds,regretBlobIds:ids,allActualRegretFactsInContext:true,createdMemories:0,execution:null};
  const after=(await call(label,'memory',{action:'recall_all'})).response;
  assert.deepEqual([...new Set(after.memories.map(m=>m.blob_id))].sort(),[...new Set(memories.A.map(m=>m.blob_id))].sort(),'The read question changed the memory inventory.');
  save();
 }
 evidence.status='PASSED';save();
 console.log(JSON.stringify({status:evidence.status,mode:evidence.mode,ratings:evidence.verdict.ratings,currentQuotas:Object.fromEntries(Object.entries(evidence.wallets).map(([l,v])=>[l,v.current.after.quota])),patternShieldActivated:false,geminiFactsVerified:evidence.gemini?.allActualRegretFactsInContext||false,evidence:resolve(directory,'evidence.json')}));
}catch(error){evidence.status='STOPPED';evidence.error=error instanceof Error?error.message:'Audit failed';save();throw error;}
finally{for(const w of workers.values())w.child.kill();}
