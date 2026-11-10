/**
 * Owner-operated Mainnet verification. Never imported by the ordinary test suite.
 * Run with: node --import tsx scripts/verify-live-application.mjs --execute
 * No mocks, alternative RPC, auth bypass, or invented historical purchases.
 */
import nextEnv from '@next/env';
import {fork} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,appendFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,randomInt,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {CHECKIN_DELAY_MS,CHECKIN_DELAY_HOURS} from '../src/lib/financial-insights.ts';

nextEnv.loadEnvConfig(process.cwd());
const labels=['A','B','C'];
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const workerLabel=option('--worker');
const origin=new URL(process.env.APP_ORIGIN||'http://127.0.0.1:3000').origin;
const base=new URL(option('--base-url')||origin).origin;
assert.equal(base,origin,'Use the application origin configured for signed memory requests.');
const stringify=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const message=error=>error instanceof Error?error.message:'Unexpected verification failure';
const units=amount=>BigInt(amount.toFixed(6).replace('.',''));
const formatUnits=value=>{const n=BigInt(value);return `${n/1000000n}.${String(n%1000000n).padStart(6,'0')}`;};

async function worker(){
  // Import server transports BEFORE installing the browser-only signing context.
  // Each isolated process represents one tab: its P-256 session key never leaves RAM.
  const [{Ed25519Keypair},chain,memwal,autopilot,{tatumSuiClient:client},session,{requestMemory},expense]=await Promise.all([
    import('@mysten/sui/keypairs/ed25519'),import('../src/lib/onchain-user-manager.ts'),
    import('../src/lib/memwal-account.ts'),import('../src/lib/autopilot-onchain.ts'),
    import('../src/lib/tatum-rpc-client.ts'),import('../src/lib/memory-session.ts'),
    import('../src/lib/memory-api.ts'),import('../src/lib/expense.ts'),
  ]);
  assert(labels.includes(workerLabel));
  const key=process.env['WALLET_'+workerLabel+'_PRIVATEKEY'];
  assert(key,'Missing private key for wallet '+workerLabel);
  let pair;
  try{pair=Ed25519Keypair.fromSecretKey(key.trim());}catch{throw Error('Unsupported key encoding for wallet '+workerLabel);}
  const wallet=pair.toSuiAddress();
  let personalSignatures=0;
  const acknowledgments=new Map();
  const emit=(kind,data)=>process.send?.({event:kind,label:workerLabel,data});
  const durable=(kind,data)=>new Promise(resolveAck=>{const ack=randomUUID();acknowledgments.set(ack,resolveAck);process.send({event:kind,label:workerLabel,data,ack});});
  const {autopilotRequestId}=await import('../src/lib/autopilot-request.ts');
  let currentAgentRequest;
  const sign=async({message:bytes})=>{personalSignatures++;return pair.signPersonalMessage(bytes);};
  Object.defineProperty(globalThis,'window',{value:{location:{origin}},configurable:true});
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    if(typeof input==='string'&&input.startsWith('/api/')){
      const headers=new Headers(init?.headers);headers.set('Origin',origin);
      if(input==='/api/agent'){
        const envelope=JSON.parse(init.body);
        if(envelope.payload.autoExecute){
          currentAgentRequest=await autopilotRequestId(wallet,envelope.nonce);
          await durable('autopilot_submission',{requestId:currentAgentRequest,wallet,threadId:envelope.payload.threadId,allowanceEpoch:envelope.payload.allowanceEpoch});
        }
      }
      return nativeFetch(base+input,{...init,headers});
    }
    return nativeFetch(input,init);
  };
  const snapshot=async()=>({wallet,profile:await chain.fetchFullUserStateViaTatum(wallet),memory:await memwal.fetchWalletMemWalAccount(wallet),allowance:await autopilot.fetchAgentAllowance(wallet),cooldowns:await chain.fetchOwnedCooldownVaultsViaTatum(wallet),personalSignatures,session:session.memorySessionStatus(wallet)});
  const safeReceipt=r=>({digest:r.digest,checkpoint:r.checkpoint,status:r.effects?.status,gasUsed:r.effects?.gasUsed,events:r.events?.map(e=>({id:e.id,type:e.type,parsedJson:e.parsedJson})),objectChanges:r.objectChanges});
  const send=async(tx,purpose)=>{
    tx.setSender(wallet);
    const bytes=await tx.build({client});
    const digest=await tx.getDigest({client});
    emit('transaction_prepared',{purpose,digest});
    const signed=await pair.signTransaction(bytes);
    // Journal the known digest BEFORE the single execution attempt. Never retry it.
    await durable('transaction_submission',{purpose,digest});
    try{
      await client.executeTransactionBlock({transactionBlock:bytes,signature:signed.signature,options:{showEffects:true,showEvents:true,showObjectChanges:true}});
    }catch(error){
      emit('execution_response_error',{purpose,digest,error:message(error),decision:'Confirm the known digest; do not resubmit.'});
    }
    const receipt=safeReceipt(await chain.confirmTransaction(digest));
    emit('transaction_confirmed',{purpose,...receipt});
    return receipt;
  };
  async function operation(command,args){
    if(command==='snapshot')return snapshot();
    if(command==='createMemory')return send(await memwal.buildCreateMemWalAccountTx(wallet),'Create owned MemWal account');
    if(command==='authorizeMemory')return send(await memwal.buildMemWalDelegateTx(wallet,'authorize'),'Authorize configured MemWal delegate');
    if(command==='profile'){
      const state=await chain.fetchFullUserStateViaTatum(wallet),m=await memwal.fetchWalletMemWalAccount(wallet);
      const friends=new Map(state.contacts.map(c=>[c.walletAddress,{address:c.walletAddress,handle:c.handle}]));
      for(const friend of args.friends)friends.set(friend.address,friend);
      return send(await chain.buildRegisterUserAndContactsTx({walletAddress:wallet,handle:state.isRegisteredOnChain?state.handle:'Loop '+workerLabel,memwalAccountId:m.accountId,safeFloorUsdc:state.isRegisteredOnChain?state.safeFloorUsdc:0.1,friends:[...friends.values()]}),'Register profile / save actual verification-wallet contacts');
    }
    if(command==='quiet'){
      const m=await memwal.fetchWalletMemWalAccount(wallet);
      const existing=session.memorySessionStatus(wallet);
      if(existing?.accountId===m.accountId&&existing.expiresAt>Date.now())return {...existing,personalSignatures,reused:true};
      const grant=await session.startMemorySession(wallet,m.accountId,sign);
      emit('quiet_session_granted',{wallet,accountId:grant.accountId,issuedAt:grant.issuedAt,expiresAt:grant.expiresAt,personalSignatures});
      return {accountId:grant.accountId,expiresAt:grant.expiresAt,personalSignatures};
    }
    if(command==='memory'){
      let response;
      try{response=await requestMemory({...args,walletAddress:wallet},sign,event=>emit('agent_progress',event));}
      catch(error){
        if(args.autoExecute&&currentAgentRequest&&error.constructor.name==='AgentReplyError')await durable('autopilot_response',{requestId:currentAgentRequest,state:'no_execution',error:message(error)});
        throw error;
      }
      if(args.autoExecute&&currentAgentRequest)await durable('autopilot_response',{requestId:currentAgentRequest,state:response.execution?.state||'no_execution',digest:response.execution?.digest});
      return {response,personalSignatures};
    }
    if(command==='bill')return chain.fetchGroupSplitByIdViaTatum(wallet,args.id);
    if(command==='allowance'){
      const current=await autopilot.fetchAgentAllowance(wallet);
      // Never silently reconfigure an existing owner policy during verification.
      assert(!current,'Existing allowance: inspect it before running a new funded policy.');
      return send(await autopilot.buildAgentAllowanceTx(wallet,args.policy),'Fund 0.10 USDC bounded Autopilot allowance');
    }
    if(command==='receipt')return autopilot.fetchAgentReceipt(args.vault,args.requestId);
    if(command==='confirm')return safeReceipt(await chain.confirmTransaction(args.digest));
    if(command==='review'){
      const {response,allowedWallets}=args,a=response.agent.action;
      if(a.kind==='split'){
        const d=a.draft;
        assert(Number(d.total)<=0.06&&Number(d.total)>0,'Split exceeds verification limit.');
        assert(d.people.every(p=>allowedWallets.includes(p.walletAddress)&&p.walletAddress!==wallet));
        const allocation=expense.computeExpense(wallet,d.people,d.total,d.mode,response.memories||[],true,{items:d.items,observations:response.verifiedSettlements,publicPreferences:response.publicPreferences});
        assert.deepEqual(allocation.shares.map(p=>[p.walletAddress,p.amountUsdc,p.requiresUpfrontEscrow]),a.allocation.shares.map(p=>[p.walletAddress,p.amountUsdc,p.requiresUpfrontEscrow]),'Review allocation changed.');
        return send(await chain.buildCreateGroupSplitTx({walletAddress:wallet,title:d.title,category:d.category,totalAmountUsdc:allocation.total,shares:allocation.shares.map(p=>({debtorAddress:p.walletAddress,amountUsdc:p.amountUsdc,requiresUpfrontEscrow:p.requiresUpfrontEscrow}))}),'Approve Gemini-prepared split after bounded review');
      }
      if(a.kind==='protect'){
        assert(Number(a.amount)>0&&Number(a.amount)<=0.02);
        return send(await chain.buildLockInCooldownVaultTx({ownerAddress:wallet,amountUsdc:Number(a.amount)}),'Approve Gemini-prepared 24-hour cooldown');
      }
      throw Error('Unexpected review action: '+a.kind);
    }
    if(command==='settle'){
      const bill=await chain.fetchGroupSplitByIdViaTatum(wallet,args.id),share=bill.participants.find(p=>p.debtor===wallet);
      assert(share&&!share.isSettled&&share.amountOwedUsdc<=0.03);
      return send(await chain.buildSettleSplitShareTx({payerAddress:wallet,splitObjectId:bill.splitId,amountUsdc:share.amountOwedUsdc,upfront:args.upfront===true}),args.upfront?'Fund real upfront share':'Pay real split share');
    }
    if(command==='splitAction')return send(await chain.buildSplitActionTx(wallet,args.id,args.action),args.action);
    if(command==='earlyUnlock'){
      try{const tx=await chain.buildUnlockCooldownVaultTx({ownerAddress:wallet,vaultObjectId:args.id});await tx.build({client});}
      catch(error){
        assert.match(message(error),/unlock_cooldown_vault/,'Unexpected failure: the cooldown guard was not verified.');
        assert.match(message(error),/\b101\b/,'Expected the contract cooldown-active abort code.');
        return {rejected:true,error:message(error),decision:'Unsigned build/simulation only; no failed withdrawal was submitted.'};
      }
      return {rejected:false};
    }
    throw Error('Unknown command '+command);
  }
  process.on('message',async m=>{
    if(m.ack){acknowledgments.get(m.ack)?.();acknowledgments.delete(m.ack);return;}
    const {id,command,args}=m;
    try{process.send?.({id,result:await operation(command,args||{})});}
    catch(error){process.send?.({id,error:message(error)});}
  });
  process.send?.({ready:true,label:workerLabel,wallet});
}

async function main(){
  const execute=process.argv.includes('--execute');
  const runId=option('--run-id')||new Date().toISOString().replace(/[:.]/g,'-');
  assert(/^[a-zA-Z0-9-]{8,80}$/.test(runId),'Invalid run ID.');
  const directory=resolve('.live-verification',runId);
  mkdirSync(directory,{recursive:true});
  const statePath=resolve(directory,'state.json'),journal=resolve(directory,'actions.jsonl');
  const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{runId,startedAt:new Date().toISOString(),checkinDelayHours:CHECKIN_DELAY_HOURS,steps:{},transactions:{},wallets:{}};
  const persist=()=>{writeFileSync(statePath+'.tmp',stringify(state));renameSync(statePath+'.tmp',statePath);};
  const log=(kind,data)=>{appendFileSync(journal,JSON.stringify({at:new Date().toISOString(),kind,...data})+'\n');};
  const workers=new Map();
  let step='initialization';
  function writeReport(){
    const completed=Object.entries(state.steps);
    const rows=completed.map(([key,s])=>'| '+key+' | '+s.label+' | '+(s.result?.digest||s.result?.response?.execution?.digest||s.result?.response?.status||s.command)+' |');
    const balanceRows=Object.entries(state.final||{}).map(([label,f])=>`| ${label} | ${f.profile.usdcBalance.toFixed(6)} | ${formatUnits(f.allowance?.balanceUnits||0)} | ${formatUnits(f.cooldowns.reduce((n,v)=>n+units(v.amountUsdc),0n))} | ${f.distinctRecalledMemories} | ${f.profile.suiBalance.toFixed(9)} |`);
    const cooldownRows=Object.entries(state.final||{}).flatMap(([label,f])=>f.cooldowns.map(v=>`| ${label} | \`${v.vaultId}\` | ${v.amountUsdc.toFixed(6)} | ${new Date(v.unlockTimeMs).toISOString()} |`));
    const allowanceRows=Object.entries(state.final||{}).map(([label,f])=>`| ${label} | \`${f.allowance?.id}\` | ${f.allowance?.active} | ${new Date(f.allowance.expiresAtMs).toISOString()} | ${f.allowance.history.filter(h=>BigInt(h.amountUnits)>0n).length} |`);
    const memories=new Map();
    for(const [key,s] of completed)for(const memory of [...s.result?.response?.createdMemories||[],...s.result?.response?.memories||[]])memories.set(s.label+':'+memory.blob_id,{label:s.label,step:key,...memory});
    writeFileSync(resolve(directory,'memories.json'),stringify([...memories.values()]));
    writeFileSync(resolve(directory,'REPORT.md'),[
      '# Live Mainnet application verification',
      '',`Run: ${runId}. Started: ${state.startedAt}. Finished: ${state.finishedAt||'in progress'}.`,
      '',`Outcome: ${state.outcome||'in progress'}. ${state.error||''}`,
      '', '## Verified wallet state', '', '| Wallet | Wallet USDC | Agent USDC | Cooldown USDC | Distinct recalled memories | Remaining SUI |','| --- | --- | --- | --- | --- | --- |',...balanceRows,
      '', '## Cooldown maturity (UTC)', '', '| Wallet | Vault | USDC | Unlock time |','| --- | --- | --- | --- |',...cooldownRows,
      '', '## Funded agent policies (UTC)', '', '| Wallet | Allowance | Active | Expiry | Nonzero payments |','| --- | --- | --- | --- | --- |',...allowanceRows,
      '', '## Ledger reconciliation', '', '```json',stringify(state.reconciliation||{status:'Not yet run; use --audit-only after completion.'}),'```',
      '', 'This is owner-authorized demonstration history from three actual wallets. It is not independent customer activity or historical merchant spending.',
      '', 'The script uses the application transaction builders, Tatum transport, actual Gemini API and HTTP memory/agent endpoints. Private keys act as wallet signing adapters. Browser layout and extension popup behavior are outside this script’s coverage.',
      '', 'Quiet Memory uses one wallet-signed, account/origin-bound grant per process (maximum one hour), followed by the real P-256 signed requests. No application authentication is bypassed.',
      '', 'Financial plan: 0.10 USDC floor, 0.10 USDC funded allowance per wallet, 0.03 per transaction, 0.10 rolling daily maximum, 1-day expiry, only the other two supplied wallets as payees. Manual splits <= 0.06 USDC. Cooldowns 0.01 USDC, locked for the actual contract duration.',
      '', 'New wallet profiles/contacts are labeled Loop A/B/C. Bills explicitly identify this live verification; no fictional merchants or old spending dates are introduced. Memory notes describe actual receipts and owner-authorized verification policies, not inferred personal traits.',
      '', '## Completed steps', '', '| Step | Wallet | Evidence / result |','| --- | --- | --- |',...rows,
      '', '## Final state', '', '```json',stringify(state.final||state.wallets),'```',
      '', '## Timing and remaining work', '',
      'The original run used a '+(state.checkinDelayHours??CHECKIN_DELAY_HOURS)+'-hour check-in delay. Immediate randomized check-ins are attempted and must be rejected without a write. No clocks, purchase dates, contract guards, or server guards are changed. Newly locked funds cannot be withdrawn before the recorded maturity. Allowances remain active for their recorded one-day lifetime and may be revoked or withdrawn by their owner in the app.',
      '', '## Full audit trail', '',
      '- actions.jsonl: every requested operation, agent progress stage, proposed action, decision, confirmed receipt, failure and check.',
      '- state.json: completed resumable steps, transaction identities, actual requests/responses, Gemini replies, policy and final balances.',
      '- memories.json: all observed committed/recalled blob IDs, exact memory text, namespace, owner wallet label and originating step. Recall-only entries are distinguishable by their step.',
      '', 'Read-only status questions must not create a memory. Each final wallet must recall at least ten distinct Walrus blobs. Only actual COMMITTED writes/recalls count; this report never treats a pending job as a successful memory.',
    ].join('\n'));
  }
  async function auditFinal(){
    assert.equal(state.outcome,'PASSED','Complete the live scenarios before the final read-only audit.');
    const [chain,memory,autopilot,{tatumSuiClient:client},{usdcToUnits},{SUI_MAINNET_USDC_TYPE,contractConfig}]=await Promise.all([
      import('../src/lib/onchain-user-manager.ts'),import('../src/lib/memwal-account.ts'),import('../src/lib/autopilot-onchain.ts'),
      import('../src/lib/tatum-rpc-client.ts'),import('../src/lib/money.ts'),import('../src/lib/config.ts'),
    ]);
    const ids=new Map(),receipts=new Map();
    for(const s of Object.values(state.steps)){
      const r=s.result;
      if(r?.splitId&&Array.isArray(r.participants))ids.set(r.splitId,r.creator);
      for(const e of r?.events||[])if(e.type===contractConfig().packageId+'::core::SplitCreatedEvent')ids.set(e.parsedJson.split_id,e.parsedJson.creator);
      if(r?.digest&&r.status?.status==='success')receipts.set(r.digest,r);
    }
    for(const r of Object.values(state.transactions))if(r.phase==='transaction_confirmed')receipts.set(r.digest,r);
    assert.equal(ids.size,7,'Expected all seven actual created bills, including escrow.');
    const bills=[];
    for(const [id,creator] of ids){
      const bill=await chain.fetchGroupSplitByIdViaTatum(creator,id);
      assert(bill.isActive&&!bill.isCancelled&&bill.pendingUpfront===0&&bill.participants.every(p=>p.isSettled),'Unsettled bill '+id);
      assert.equal(usdcToUnits(bill.totalBillUsdc),usdcToUnits(bill.creatorShareUsdc)+bill.participants.reduce((n,p)=>n+usdcToUnits(p.amountOwedUsdc),0n));
      bills.push({...bill,checkinDueAt:new Date(bill.createdAtMs+CHECKIN_DELAY_MS).toISOString()});
    }
    const wallets={};let total=0n;
    for(const label of labels){
      const wallet=state.wallets[label].wallet,profile=await chain.fetchFullUserStateViaTatum(wallet),account=await memory.fetchWalletMemWalAccount(wallet),vault=await autopilot.fetchAgentAllowance(wallet),cooldowns=await chain.fetchOwnedCooldownVaultsViaTatum(wallet);
      assert(account?.owner===wallet&&account.active&&account.delegateAuthorized&&profile.memwalAccountId===account.accountId);
      assert(vault?.active&&vault.owner===wallet&&vault.memoryId===account.accountId&&vault.profileId===profile.profileId&&vault.expiresAtMs>Date.now());
      assert.equal(BigInt(vault.perTxUnits),30000n);assert.equal(BigInt(vault.dailyUnits),100000n);
      assert.deepEqual([...vault.payees].sort(),labels.filter(l=>l!==label).map(l=>state.wallets[l].wallet).sort());
      const spent=vault.history.reduce((n,h)=>n+BigInt(h.amountUnits),0n);
      assert.equal(spent,20000n);assert.equal(BigInt(vault.balanceUnits)+spent,100000n);
      const locked=cooldowns.reduce((n,v)=>n+usdcToUnits(v.amountUsdc),0n);assert.equal(locked,10000n);
      assert(cooldowns.every(v=>v.unlockTimeMs>Date.now()));
      total+=usdcToUnits(profile.usdcBalance)+BigInt(vault.balanceUnits)+locked;
      wallets[label]={wallet,profile,account,allowance:vault,cooldowns,distinctRecalledMemories:state.final[label].distinctRecalledMemories};
    }
    const initial=labels.reduce((n,l)=>n+usdcToUnits(state.wallets[l].profile.usdcBalance),0n);assert.equal(total,initial);
    const settlementEvents=new Map(),agentEvents=new Map();
    for(const r of receipts.values())for(const e of r.events||[]){
      if(e.type===contractConfig().packageId+'::core::ShareSettledEvent')settlementEvents.set(e.id.txDigest+':'+e.id.eventSeq,e);
      if(e.type.endsWith('::autopilot::AgentActionEvent'))agentEvents.set(e.id.txDigest+':'+e.id.eventSeq,e);
    }
    assert.equal(receipts.size,37);assert.equal(settlementEvents.size,14);assert.equal(agentEvents.size,9);
    const transferred=[...settlementEvents.values()].reduce((n,e)=>n+BigInt(e.parsedJson.amount),0n);assert.equal(transferred,220000n);
    const executor=process.env.NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS,executorBalances=await client.getAllBalances({owner:executor});
    const before=JSON.parse(readFileSync(resolve(directory,'executor-before.json'),'utf8'));
    assert.equal(executorBalances.find(b=>b.coinType===SUI_MAINNET_USDC_TYPE)?.totalBalance,before.balances.find(b=>b.coinType===SUI_MAINNET_USDC_TYPE)?.totalBalance,'Executor USDC must not fund owner shares.');
    const evidence={at:new Date().toISOString(),wallets,bills,executorBalances,settlementEvents:[...settlementEvents.values()],agentEvents:[...agentEvents.values()]};
    writeFileSync(resolve(directory,'reconciliation.json'),stringify(evidence));
    state.reconciliation={status:'PASSED',at:evidence.at,bills:bills.length,confirmedTransactions:receipts.size,settledShares:settlementEvents.size,agentTransactions:agentEvents.size,transferredUsdc:formatUnits(transferred),totalHeldUsdc:formatUnits(total),initialUsdc:formatUnits(initial),executorUsdcChanged:false};
    persist();log('final_reconciliation',state.reconciliation);writeReport();console.log(stringify(state.reconciliation));
  }
  async function start(label){
    const child=fork(fileURLToPath(import.meta.url),['--worker',label,'--base-url',base],{execArgv:['--import','tsx'],stdio:['ignore','pipe','pipe','ipc']});
    const pending=new Map();
    const ready=new Promise((resolveReady,reject)=>{
      child.on('message',m=>{
        if(m.ready){workers.set(label,{child,wallet:m.wallet,pending});resolveReady(m);}
        else if(m.event){
          log(m.event,{label,data:m.data,step});
          if(m.event.startsWith('transaction_')){state.transactions[m.data.digest]={...state.transactions[m.data.digest],...m.data,label,step,phase:m.event};persist();}
          if(m.event.startsWith('autopilot_')){state.agentRequests??={};state.agentRequests[m.data.requestId]={...state.agentRequests[m.data.requestId],...m.data,label,step};persist();}
          if(m.ack)child.send({ack:m.ack});
        }else if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(label+': '+m.error));else p?.resolve(m.result);}
      });
      child.on('error',reject);
      child.on('exit',code=>{reject(Error('Wallet worker exited '+code));for(const p of pending.values())p.reject(Error('Wallet worker exited '+code));});
    });
    // Do not copy arbitrary SDK diagnostics or key-decoding errors into public reports.
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    await ready;
  }
  const call=(label,command,args={})=>new Promise((resolveCall,reject)=>{const w=workers.get(label),id=randomUUID();w.pending.set(id,{resolve:resolveCall,reject});w.child.send({id,command,args});});
  async function once(key,label,command,args={},decision='Use the actual application implementation with the supplied wallet.'){
    if(state.steps[key])return state.steps[key].result;
    step=key;
    log('requested',{step:key,label,command,args,decision});
    console.log('['+label+'] '+key);
    const result=await call(label,command,args);
    state.steps[key]={label,command,args,decision,result,at:new Date().toISOString()};persist();writeReport();
    log('completed',{step:key,label,result});
    return result;
  }
  const memory=(key,label,payload)=>once(key,label,'memory',payload);
  const note=(key,label,text,category='social_split_trust')=>memory(key,label,{action:'remember',category,text});
  const eventId=(receipt,name,field)=>{
    const e=receipt.events?.find(e=>e.type.endsWith('::'+name));
    assert(e?.parsedJson?.[field],'Missing '+name+' event in confirmed receipt.');return e.parsedJson[field];
  };
  async function chat(key,label,text,autoExecute=false){
    const vault=autoExecute?(await call(label,'snapshot')).allowance:null;
    return memory(key,label,{action:'agent_chat',threadId:randomUUID(),text,timeZone:'Asia/Kolkata',autoExecute,autoMemory:false,...(vault?{allowanceEpoch:vault.epoch}:{})});
  }
  async function learnSettlement(key,receipt,involved){for(const label of involved)await memory(key+'-memory-'+label,label,{action:'settlement',digest:receipt.digest});}
  async function delivery(key,digest){
    if(state.steps[key])return state.steps[key].result;
    step=key;
    const secret=process.env.AUTOPILOT_WEBHOOK_SECRET;
    assert(secret&&secret.length>=32,'Configure the server-only event-delivery secret first.');
    log('event_delivery_requested',{step:key,digest,decision:'Deliver an actual confirmed digest through the same live application and executor queue.'});
    // Use the same live server and executor queue as post-response delivery.
    // A second Node executor would not share its process-local signing lock.
    const raw=JSON.stringify({digest}),issued=String(Date.now()),signature=createHmac('sha256',secret).update(issued+'.'+raw).digest('hex');
    const response=await fetch(base+'/api/autopilot/events',{method:'POST',headers:{'content-type':'application/json','x-solvency-issued-at':issued,'x-solvency-signature':signature},body:raw});
    const result=await response.json();
    if(!response.ok){log('event_delivery_failed',{step:key,digest,httpStatus:response.status,result,decision:'Keep the original confirmed bill. Retry only its idempotent event digest; never replay the user command.'});throw Error('Confirmed event processing did not finish (HTTP '+response.status+'). The original bill is retained; inspect the recorded event result.');}
    state.steps[key]={label:'event',command:'confirmed_bill_delivery',args:{digest},result,at:new Date().toISOString()};persist();writeReport();log('event_delivery',{step:key,digest,result});
    return result;
  }
  if(process.argv.includes('--report-only')){writeReport();console.log('Rebuilt audit report: '+resolve(directory,'REPORT.md'));return;}
  if(process.argv.includes('--audit-only')){await auditFinal();return;}
  try{
    for(const label of labels)await start(label);
    const addresses=labels.map(l=>workers.get(l).wallet);
    assert.equal(new Set(addresses).size,3,'Supply three distinct wallets.');
    const {executorConfiguration}=await import('../src/lib/agent-executor.ts');
    const executor=executorConfiguration();assert(executor.configured&&!addresses.includes(executor.address),'A separate configured executor is required.');
    for(const label of labels){
      const initial=await once('preflight-'+label,label,'snapshot');state.wallets[label]=initial;
      assert(initial.profile.suiBalance>=0.05,'Insufficient SUI gas.');assert(initial.profile.usdcBalance>=0.3,'Insufficient USDC for bounded verification.');
      if(execute)assert(!initial.allowance,'A new run must not replace a pre-existing funded allowance. Resume its original run or inspect the owner policy first.');
    }
    persist();writeReport();
    if(!execute){state.outcome='READ_ONLY';console.log('Read-only preflight complete. Add --execute to perform the owner-authorized Mainnet flow.');return;}
    state.outcome='RUNNING';delete state.error;delete state.finishedAt;persist();
    assert((process.env.AUTOPILOT_WEBHOOK_SECRET||'').length>=32,'Configure a random server-only AUTOPILOT_WEBHOOK_SECRET before --execute.');
    const health=await fetch(base+'/app');assert(health.ok,'Start the real Next.js application before --execute.');
    // An uncertain mutation never gets automatically replayed on resume.
    for(const tx of Object.values(state.transactions))assert(tx.phase==='transaction_confirmed','Unresolved transaction '+tx.digest+': confirm its receipt before continuing.');
    for(const request of Object.values(state.agentRequests||{})){
      if(['confirmed','review_required','no_execution'].includes(request.state))continue;
      const snapshot=await call(request.label,'snapshot');
      const receipt=await call(request.label,'receipt',{vault:snapshot.allowance.id,requestId:request.requestId});
      assert(receipt,'Unresolved Autopilot request '+request.requestId+': no receipt yet; do not issue a replacement command.');
      await once('reconcile-proof-'+request.requestId,request.label,'confirm',{digest:receipt.digest},'Read and verify the original receipt; never replay the financial command.');
      await call(request.label,'quiet');
      const recovered=await memory('reconcile-memory-'+request.requestId,request.label,{action:'agent_status',requestId:request.requestId});
      assert.equal(recovered.response.execution?.state,'confirmed');assert.equal(recovered.response.execution?.digest,receipt.digest);
      const original=readFileSync(journal,'utf8').trim().split('\n').map(JSON.parse).find(e=>e.kind==='requested'&&e.step===request.step);
      state.steps[request.step]={label:request.label,command:'recovered_agent_status',args:original?.args,result:recovered,decision:'Original on-chain action recovered by request ID; no financial command was resubmitted.',at:new Date().toISOString()};
      state.agentRequests[request.requestId]={...request,state:'confirmed',digest:receipt.digest,recovered:true};persist();
      log('financial_reconciliation',{label:request.label,requestId:request.requestId,receipt,decision:'Use the original confirmed bill and idempotent event delivery.'});
    }
    for(const label of labels){
      const initial=await call(label,'snapshot');
      if(!initial.memory)await once('create-memory-'+label,label,'createMemory');
      if(!(await call(label,'snapshot')).memory.delegateAuthorized)await once('authorize-memory-'+label,label,'authorizeMemory');
      const friends=labels.filter(l=>l!==label).map(l=>({address:workers.get(l).wallet,handle:'Loop '+l}));
      await once('register-contacts-'+label,label,'profile',{friends});
      // A resumed process needs a fresh RAM grant; completed transactions remain skipped.
      step='quiet-session-'+label;const quiet=await call(label,'quiet');log('quiet_session',{label,result:quiet});
      await note('onboarding-note-'+label,label,'Owner-authorized live application verification '+runId+': wallet '+label+' completed real MemWal onboarding, linked its owned account and saved the other supplied wallets as contacts. This is verification activity, not a record of historical personal purchases.');
      for(const other of labels.filter(l=>l!==label))await memory('standard-preference-'+label+'-'+other,label,{action:'save_preference',subjectWallet:workers.get(other).wallet,upfrontAboveUsdc:0.03,fundingPolicy:'never',excludeAlcohol:false});
      const question=await chat('read-only-chat-'+label,label,'What are my pending splits?');
      assert.equal(question.response.createdMemories?.length||0,0,'Read-only chat wrote a memory.');
      assert.equal(question.personalSignatures,1,'Quiet Memory requested another wallet signature.');
    }
    // Three creator rotations, all using the real Gemini structured action + review card allocation.
    for(const [index,label] of labels.entries()){
      const others=labels.filter(l=>l!==label),title='Live '+label+' '+runId.slice(0,10),category=['dining','travel','groceries'][index];
      const prepared=await chat('manual-gemini-'+label,label,`Create a split titled "${title}" in category ${category}, total exactly 0.06 USDC equally between me, Loop ${others[0]} and Loop ${others[1]}. Use standard settlement without upfront funding. This is an owner-authorized live verification bill, not a merchant purchase. Prepare it for my review.`);
      assert.equal(prepared.response.agent.action.kind,'split','Gemini did not prepare a split.');
      const receipt=await once('manual-create-'+label,label,'review',{response:prepared.response,allowedWallets:addresses});
      const id=eventId(receipt,'SplitCreatedEvent','split_id');
      for(const payer of others){const paid=await once('manual-pay-'+label+'-'+payer,payer,'settle',{id});await learnSettlement('manual-'+label+'-'+payer,paid,[payer,label]);}
      const bill=await once('manual-final-'+label,label,'bill',{id});assert(bill.participants.every(p=>p.isSettled),'A manual bill share is unpaid.');
      const verdict=randomInt(2)?'regretted':'worth_it';
      try{
        await memory('immediate-regret-'+label,label,{action:'regret_checkin',splitId:id,purchaseId:id.slice(2),timeZone:'Asia/Kolkata',verdict,...(verdict==='regretted'?{intensity:randomInt(1,6)}:{})});
        throw Error('A new bill incorrectly accepted a check-in before the configured delay.');
      }catch(error){assert.match(message(error),/check-in is not due yet/);log('expected_guard',{label,bill:id,error:message(error),decision:'No backdating or rule bypass. Positive check-in remains subject to the configured delay.'});}
      await note('checkin-due-note-'+label,label,`Live verification bill ${id} was created at ${new Date(bill.createdAtMs).toISOString()}. An immediate randomized guard test was correctly rejected; a real personal check-in is due after ${new Date(bill.createdAtMs+CHECKIN_DELAY_MS).toISOString()}. No regret verdict or historical merchant purchase is asserted.`,'habit_regret');
    }
    // Recalled standing preference must mutate real escrow arguments; then fund, activate and learn.
    const a='A',b='B',c='C';
    await memory('upfront-preference-A-B',a,{action:'save_preference',subjectWallet:workers.get(b).wallet,upfrontAboveUsdc:0.005,fundingPolicy:'always',excludeAlcohol:false});
    const escrowDraft=await chat('escrow-gemini',a,'Create a 0.06 USDC equal split titled "Live upfront verification" in other category between me, Loop B and Loop C. Apply my saved payment preferences, including upfront funding. Prepare it for review.');
    assert.equal(escrowDraft.response.agent.action.kind,'split');
    assert(escrowDraft.response.agent.action.allocation.shares.find(s=>s.walletAddress===workers.get(b).wallet)?.requiresUpfrontEscrow,'Saved preference did not set upfront escrow.');
    const escrowCreated=await once('escrow-create',a,'review',{response:escrowDraft.response,allowedWallets:addresses}),escrowId=eventId(escrowCreated,'SplitCreatedEvent','split_id');
    await once('escrow-fund-B',b,'settle',{id:escrowId,upfront:true});
    const activated=await once('escrow-activate',a,'splitAction',{id:escrowId,action:'activate_group_split'});await learnSettlement('escrow-B',activated,[a,b]);
    const escrowPaid=await once('escrow-pay-C',c,'settle',{id:escrowId});await learnSettlement('escrow-C',escrowPaid,[a,c]);
    await memory('restore-standard-A-B',a,{action:'save_preference',subjectWallet:workers.get(b).wallet,upfrontAboveUsdc:0.03,fundingPolicy:'never',excludeAlcohol:false});
    for(const label of labels){
      const policy={budget:'0.10',perTx:'0.03',daily:'0.10',days:1,allowCreate:true,allowIncoming:true,allowCooldown:true,payees:addresses.filter(w=>w!==workers.get(label).wallet)};
      const allowance=await once('allowance-'+label,label,'allowance',{policy});
      await note('allowance-note-'+label,label,'Owner-authorized verification allowance funded with 0.10 USDC; per-action cap 0.03 USDC, rolling daily cap 0.10 USDC, one-day expiry, payees limited to the other two supplied wallets, create/incoming/cooldown enabled. Confirmed transaction '+allowance.digest+'. Owner can revoke or withdraw independently.');
      const protect=await chat('cooldown-gemini-'+label,label,'Protect exactly 0.01 USDC in a 24-hour cooldown vault. Prepare this for my wallet review; do not change my spending preferences.');
      assert.equal(protect.response.agent.action.kind,'protect');
      const locked=await once('cooldown-lock-'+label,label,'review',{response:protect.response,allowedWallets:addresses}),id=eventId(locked,'CooldownLockedEvent','vault_id');
      const snap=await once('cooldown-state-'+label,label,'snapshot'),vault=snap.cooldowns.find(v=>v.vaultId===id);assert(vault);
      await note('cooldown-note-'+label,label,`Actual 0.01 USDC cooldown deposit confirmed in ${locked.digest}, vault ${id}, unlocks ${new Date(vault.unlockTimeMs).toISOString()}. This is a liquidity protection action, not a regretted merchant purchase.`,'cashflow_elasticity');
      const early=await once('cooldown-early-unlock-'+label,label,'earlyUnlock',{id});assert(early.rejected,'Premature cooldown withdrawal unexpectedly built.');
    }
    // Event-driven incoming payments: real confirmed digests, actual recipient consent, own funded limits.
    for(const label of labels){
      const others=labels.filter(l=>l!==label);
      const turn=await chat('autopilot-gemini-'+label,label,`Create a split titled "Live Autopilot ${label}" in other category, total exactly 0.03 USDC equally between me, Loop ${others[0]} and Loop ${others[1]}. Use my funded Autopilot allowance now, with standard settlement and no upfront funding.`,true);
      assert.equal(turn.response.execution?.state,'confirmed','Autopilot creation was not confirmed; inspect receipt before retry.');
      const digest=turn.response.execution.digest;
      const dispatch=await delivery('incoming-'+label,digest);log('incoming_monitoring',{label,creationDigest:digest,result:dispatch});
      const audit=await call(label,'receipt',{vault:(await call(label,'snapshot')).allowance.id,requestId:turn.response.execution.requestId});assert(audit?.digest===digest,'Missing matching on-chain agent receipt.');
      const id=audit.objectId,bill=await once('autopilot-final-bill-'+label,label,'bill',{id});
      assert(bill.participants.every(p=>p.isSettled),'Incoming Autopilot share was not settled; inspect delivery result.');
      // Import actual event proofs into each owner’s account; never repeat financial execution.
      for(const item of dispatch.results||[])if(item.digest&&item.status==='confirmed')await learnSettlement('auto-settlement-'+label+'-'+item.wallet,{digest:item.digest},labels.filter(l=>workers.get(l).wallet===item.wallet||l===label));
    }
    for(const label of labels){
      const evidence=Object.values(state.steps).filter(s=>s.label===label).flatMap(s=>s.result?.response?.createdMemories||[]).map(m=>m.text).slice(-6).join('\n').slice(0,6000);
      const analysisText=`Analyze only these recorded live verification facts for wallet ${label} (${runId}). Explain observed settlements and liquidity tradeoffs. These facts concern owner-authorized verification, not historical merchant spending. Do not infer personal traits or invent purchases, regret ratings, counterparties or dates.\n${evidence}`;
      await memory('analyze-'+label,label,{action:'analyze',category:'cashflow_elasticity',text:analysisText});
      await memory('restore-'+label,label,{action:'restore',category:'cashflow_elasticity'});
      const recalled=await memory('final-recall-'+label,label,{action:'recall_all'}),count=new Set(recalled.response.memories.map(m=>m.blob_id)).size;
      assert(count>=10,'Fewer than ten actual recalled memories for '+label+': '+count);
      // Background payments have their own receipts. Reconcile every digest found
      // in committed memories, including work dispatched inside the real server.
      for(const memory of recalled.response.memories){
        for(const match of memory.text.matchAll(/"digest"\s*:\s*"([1-9A-HJ-NP-Za-km-z]{40,50})"/g)){
          await once('confirmed-evidence-'+match[1],label,'confirm',{digest:match[1]});
        }
      }
      const final=await call(label,'snapshot');assert.equal(final.personalSignatures,1,'Session requested extra wallet messages.');
      state.final??={};state.final[label]={...final,distinctRecalledMemories:count};persist();
    }
    state.outcome='PASSED';state.finishedAt=new Date().toISOString();persist();writeReport();
    console.log('Live verification passed. Audit report: '+resolve(directory,'REPORT.md'));
  }catch(error){state.outcome='STOPPED';state.error=message(error);log('failure',{step,error:state.error,decision:'No blind financial or memory replay. Inspect the recorded receipts and resume completed steps by run ID.'});persist();writeReport();throw error;}
  finally{for(const w of workers.values())w.child.kill();writeReport();}
}

if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
  (workerLabel?worker():main()).catch(error=>{console.error('[FAIL] '+message(error));process.exitCode=1;});
}
