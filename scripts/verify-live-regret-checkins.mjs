/** Owner-authorized, memory-only follow-up using the real application wallet workers and API. */
import nextEnv from '@next/env';
import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {CHECKIN_DELAY_MS,CHECKIN_DELAY_HOURS,purchaseMemories,regretMemories,memoryRecord,spendingRoom} from '../src/lib/financial-insights.ts';
import {checkInPurchases} from '../src/lib/bill-purchases.ts';
import {getWalletNamespace} from '../src/lib/config.ts';
import {usdcToUnits} from '../src/lib/money.ts';

nextEnv.loadEnvConfig(process.cwd());
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const errorText=e=>e instanceof Error?e.message:'Unexpected verification error';
async function run(){
 if(!process.argv.includes('--execute')){console.log('Use --execute --source-run <original-run> --run-id <follow-up-run> to submit the authorized real check-ins. No action performed.');return;}
 assert.equal(CHECKIN_DELAY_HOURS,6);
 const sourceRun=arg('--source-run')||'live-mainnet-2026-11-10',runId=arg('--run-id')||'regret-six-hours-'+new Date().toISOString().replace(/[:.]/g,'-');
 for(const id of [sourceRun,runId])assert(/^[a-zA-Z0-9-]{8,80}$/.test(id),'Invalid run ID.');
 const source=JSON.parse(readFileSync(resolve('.live-verification',sourceRun,'reconciliation.json'),'utf8'));
 const origin=new URL(process.env.APP_ORIGIN||'http://127.0.0.1:3000').origin;
 const directory=resolve('.live-verification',runId);mkdirSync(directory,{recursive:true});
 const stateFile=resolve(directory,'state.json'),journal=resolve(directory,'actions.jsonl');
 const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{runId,sourceRun,startedAt:new Date().toISOString(),policyHours:CHECKIN_DELAY_HOURS,initial:{},plan:[],notes:{},completed:{},final:{}};
 assert.equal(state.sourceRun,sourceRun);assert.equal(state.policyHours,CHECKIN_DELAY_HOURS);
 const save=()=>{writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2));renameSync(stateFile+'.tmp',stateFile);};
 const log=(kind,data)=>appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),kind,...data})+'\n');
 const workers=new Map();
 async function open(label){
  const child=fork(fileURLToPath(new URL('./verify-live-application.mjs',import.meta.url)),['--worker',label,'--base-url',origin],{execArgv:['--import','tsx'],stdio:['ignore','pipe','pipe','ipc']});
  const pending=new Map();
  await new Promise((ready,reject)=>{
   child.on('message',m=>{
    if(m.ready){workers.set(label,{child,pending,wallet:m.wallet});ready();return;}
    if(m.event){
     log(m.event,{label,data:m.data});
     if(m.event.startsWith('transaction_')||m.event==='autopilot_submission'){child.kill();reject(Error('Financial execution is prohibited in this memory-only follow-up.'));return;}
     if(m.ack)child.send({ack:m.ack});return;
    }
    const request=pending.get(m.id);pending.delete(m.id);if(m.error)request?.reject(Error(label+': '+m.error));else request?.resolve(m.result);
   });
   child.on('error',reject);child.on('exit',code=>{reject(Error('Wallet worker exited '+code));for(const p of pending.values())p.reject(Error('Wallet worker exited '+code));});
  });
  child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
 }
 const call=(label,command,args={})=>{
  assert(['snapshot','quiet','memory','bill'].includes(command),'Only real memory/read operations are permitted.');
  if(command==='memory')assert(['recall_all','regret_checkin','remember'].includes(args.action));
  log('requested',{label,command,args});
  return new Promise((resolveCall,reject)=>{const worker=workers.get(label),id=randomUUID();worker.pending.set(id,{resolve:resolveCall,reject});worker.child.send({id,command,args});});
 };
 const request=async(label,payload)=>{const result=await call(label,'memory',payload);log('response',{label,payload,result});return result;};
 const shuffle=values=>{for(let i=values.length-1;i>0;i--){const j=randomInt(i+1);[values[i],values[j]]=[values[j],values[i]];}return values;};
 function report(){
  const rows=state.plan.map(p=>{const result=state.completed[p.label+':'+p.id];return `| ${p.label} | ${p.merchant} | ${p.verdict}${p.intensity?' · '+p.intensity+'/5':''} | ${new Date(p.purchasedAtMs).toISOString()} | ${result?'COMMITTED':'pending'} |`;});
  const counts=Object.entries(state.final).map(([label,f])=>`| ${label} | ${f.memoryCount} | ${f.ratings.length} | ${f.snapshot.profile.usdcBalance.toFixed(6)} |`);
  const newMemories=[...Object.entries(state.notes).flatMap(([label,value])=>(value.response.createdMemories||[]).map(m=>({label,...m}))),...Object.entries(state.completed).flatMap(([key,value])=>(value.response.createdMemories||[]).map(m=>({label:key.split(':')[0],...m})))];
  writeFileSync(resolve(directory,'memories-written.json'),JSON.stringify(newMemories,null,2));
  writeFileSync(resolve(directory,'REPORT.md'),[
   '# Six-hour regret check-in verification','',`Run: ${runId}. Source: ${sourceRun}. Outcome: ${state.outcome||'in progress'}. ${state.error||''}`,'',
   'The owner explicitly authorized reducing the application delay from 48 to six hours and assigning randomized ratings to these verification wallets. This is the actual shared application policy, enforced by both API and client. Purchase/bill timestamps, ownership checks and the 24-hour Move cooldown were not modified. These ratings are randomized verification feedback, not statements of genuine consumer regret.','',
   'The existing application wallet workers created one real Quiet Memory grant per process. All writes used the actual signed memory API and each wallet’s linked MemWal account. No mock, alternative RPC, direct storage bypass, payment, allowance update or transaction signature was used.','',
   '## Actual check-ins','', '| Wallet | Source purchase / created bill | Assigned rating | Original purchase time (UTC) | Result |','| --- | --- | --- | --- | --- |',...rows,'',
   '## Final recalled state','', '| Wallet | Distinct recalled blobs | Total readable ratings | Wallet USDC |','| --- | --- | --- | --- |',...counts,'',
   `Standalone purchase records found: ${Object.values(state.initial).reduce((n,v)=>n+v.standalonePurchases,0)}. Bills are rated only by their creator and for the creator’s exact share; debtor shares are not invented as separate merchant purchases.`,'',
   'Randomization is persisted before the first write. For each wallet with multiple unrated entries, the plan includes Worth It and Regretted, shuffles their assignment, and samples any additional verdict and regret intensity with crypto.randomInt. Re-running the same run ID keeps those choices and skips completed commits.','',
   'Each check-in commits one SOLVENCY_REGRET_V1 fact and one SOLVENCY_CASHFLOW_V1 fact. A separate important context note in each account records the owner-authorized randomization, new policy and exact assigned bill IDs, so later agent recall can distinguish this verification from genuine personal feedback.','',
   'actions.jsonl records requests, actual responses, committed blob IDs/text and decisions. state.json records the persisted assignment, original data, final recalls and insights. memories-written.json contains the exact new committed memory facts. Existing historical run reports remain historical; their former 48-hour due dates are superseded by this explicitly authorized six-hour policy.','',
   'No raw wallet keys, signatures or session grants are stored here. The account-wide delegate permission and exact wallet/account/origin session checks remain enforced.',
  ].join('\n'));
 }
 try{
  assert((await fetch(origin+'/app')).ok,'Start the rebuilt real application first.');
  for(const label of ['A','B','C']){
   await open(label);const wallet=workers.get(label).wallet;assert.equal(wallet,source.wallets[label].wallet,'Private key does not match the original verification wallet.');
   const snapshot=await call(label,'snapshot');assert(snapshot.memory?.active&&snapshot.memory.delegateAuthorized&&snapshot.profile.memwalAccountId===snapshot.memory.accountId);
   await call(label,'quiet');
   const recalled=await request(label,{action:'recall_all'});
   if(!state.initial[label]){
    const bills=[];for(const b of source.bills.filter(b=>b.creator===wallet))bills.push(await call(label,'bill',{id:b.splitId}));
    const rows=checkInPurchases(recalled.response.memories,wallet,bills),rated=new Set(regretMemories(recalled.response.memories,wallet).map(r=>r.id));
    const eligible=rows.filter(p=>!rated.has(p.id)&&Date.now()>=p.purchasedAtMs+CHECKIN_DELAY_MS);
    const verdicts=shuffle(eligible.map((_,i)=>i===0?'worth_it':i===1?'regretted':randomInt(2)?'regretted':'worth_it'));
    const planned=eligible.map((p,i)=>({...p,label,verdict:verdicts[i],intensity:verdicts[i]==='regretted'?randomInt(1,6):0,dueAt:p.purchasedAtMs+CHECKIN_DELAY_MS}));
    state.plan.push(...planned);state.initial[label]={snapshot,standalonePurchases:purchaseMemories(recalled.response.memories,wallet).length,eligible:planned.length,notYetDue:rows.filter(p=>Date.now()<p.purchasedAtMs+CHECKIN_DELAY_MS),response:recalled.response};save();
   }
  }
  assert(state.plan.length>0,'No unrated six-hour entries were eligible; no fake or backdated purchase was created.');
  state.outcome='RUNNING';delete state.error;save();report();log('randomized_plan_persisted',{policyHours:CHECKIN_DELAY_HOURS,plan:state.plan});
  const writes=await Promise.allSettled(['A','B','C'].map(async label=>{
   const planned=state.plan.filter(p=>p.label===label);if(!planned.length)return;
   if(!state.notes[label]){
    const text='Owner-authorized randomized verification feedback. VERIFICATION_CHECKIN_CONTEXT_V1 '+JSON.stringify({runId,owner:workers.get(label).wallet,checkinDelayHours:CHECKIN_DELAY_HOURS,updatedAtMs:Date.now(),purpose:'Random test ratings requested by owner, not genuine consumer opinions. Prior 48-hour notes describe the former policy. Original timestamps unchanged.',assignments:planned.map(p=>({purchaseId:p.id,splitId:p.splitId,verdict:p.verdict,intensity:p.intensity}))});
    const result=await request(label,{action:'remember',category:'habit_regret',text});assert.equal(result.response.status,'COMMITTED');state.notes[label]=result;save();report();
   }
   for(const p of planned){
    const key=label+':'+p.id;if(state.completed[key])continue;
    assert(Date.now()>=p.dueAt);console.log('['+label+'] '+p.merchant+' → '+p.verdict+(p.intensity?' '+p.intensity+'/5':''));
    const result=await request(label,{action:'regret_checkin',purchaseId:p.id,...(p.splitId?{splitId:p.splitId,timeZone:'Asia/Kolkata'}:{}),verdict:p.verdict,intensity:p.intensity});
    assert.equal(result.response.status,'COMMITTED');assert.equal(result.response.createdMemories.length,2);
    const rating=regretMemories(result.response.createdMemories,workers.get(label).wallet).find(r=>r.id===p.id);
    assert(rating);assert.equal(rating.verdict,p.verdict);assert.equal(rating.intensity,p.intensity);assert.equal(rating.purchasedAtMs,p.purchasedAtMs);assert.equal(rating.amountUnits,p.amountUnits);
    assert(result.response.createdMemories.some(m=>m.namespace===getWalletNamespace(rating.owner,'habit_regret')));
    const cashflow=result.response.createdMemories.find(m=>m.namespace===getWalletNamespace(rating.owner,'cashflow_elasticity'));
    assert(cashflow);assert.equal(memoryRecord(cashflow.text,'SOLVENCY_CASHFLOW_V1')?.purchaseId,p.id);
    state.completed[key]=result;save();report();
   }
  }));
  for(const result of writes)if(result.status==='rejected')log('wallet_write_failure',{error:errorText(result.reason)});
  const failed=writes.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
  for(const label of ['A','B','C']){
   const wallet=workers.get(label).wallet,recalled=await request(label,{action:'recall_all'}),ratings=regretMemories(recalled.response.memories,wallet);
   const recalledBlobs=new Set(recalled.response.memories.map(m=>m.blob_id));
   for(const [key,result] of Object.entries(state.completed))if(key.startsWith(label+':'))for(const memory of result.response.createdMemories)assert(recalledBlobs.has(memory.blob_id),'A committed check-in or cash-flow fact was missing from final recall.');
   for(const p of state.plan.filter(p=>p.label===label)){const rating=ratings.find(r=>r.id===p.id);assert.equal(rating?.verdict,p.verdict);assert.equal(rating?.intensity,p.intensity);}
   const snapshot=await call(label,'snapshot'),before=state.initial[label].snapshot;
   assert.equal(usdcToUnits(snapshot.profile.usdcBalance),usdcToUnits(before.profile.usdcBalance));assert.equal(snapshot.profile.suiBalance,before.profile.suiBalance);assert.equal(snapshot.allowance.balanceUnits,before.allowance.balanceUnits);
   assert.equal(snapshot.personalSignatures,1,'Quiet Memory requested another wallet signature.');
   const room=spendingRoom(snapshot.profile.usdcBalance,snapshot.profile.safeFloorUsdc,0,recalled.response.memories,wallet,Date.now(),'Asia/Kolkata');
   state.final[label]={memoryCount:new Set(recalled.response.memories.map(m=>m.blob_id)).size,ratings,snapshot,insights:room,response:recalled.response};save();report();
  }
  state.outcome='PASSED';state.finishedAt=new Date().toISOString();save();report();
  console.log(JSON.stringify({status:state.outcome,checkins:Object.keys(state.completed).length,counts:Object.fromEntries(Object.entries(state.final).map(([l,v])=>[l,v.memoryCount])),report:resolve(directory,'REPORT.md')}));
 }catch(error){state.outcome='STOPPED';state.error=errorText(error);save();report();log('failure',{error:state.error,decision:'Keep committed facts and the persisted random plan; do not manufacture a successful empty result.'});throw error;}
 finally{for(const w of workers.values())w.child.kill();}
}
run().catch(error=>{console.error('[FAIL] '+errorText(error));process.exitCode=1;});
