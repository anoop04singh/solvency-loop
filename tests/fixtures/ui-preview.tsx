// Isolated component fixtures, served only by Playwright request interception.
// This is not a Next.js route and never connects a wallet or sends a transaction.
import { useState,useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {useLearningSession} from '../../src/lib/use-learning-session';
import {parseBillDraft} from '../../src/lib/bill-draft';
import { SmartSplitEnginePanel } from '../../src/components/SmartSplitEnginePanel';
import { MemoryAndRpcInspector } from '../../src/components/MemoryAndRpcInspector';
import { IdentityAndContactsPanel, type FriendInput } from '../../src/components/IdentityAndContactsPanel';
import {type OnChainUserProfile} from '../../src/lib/onchain-user-manager';

import { CooldownVaultPanel,VaultLockDialog } from '../../src/components/CooldownVaultPanel';
import { MemWalAccountPanel } from '../../src/components/MemWalAccountPanel';
import { RegretCheckInPanel } from '../../src/components/RegretCheckInPanel';
import { SpendingOverview } from '../../src/components/SpendingOverview';
import { spendingRoom,DAY_MS } from '../../src/lib/financial-insights';
import type { RecalledMemory } from '../../src/lib/memory-protocol';
import {WorkspaceNavigation,primaryViews,type WorkspaceView} from '../../src/components/WorkspaceNavigation';
import {WorkspaceHeader,WorkspaceFooter} from '../../src/components/WorkspaceChrome';
import {ProofDrawer} from '../../src/components/ProofDrawer';
import {CounterpartySettlementPanel} from '../../src/components/CounterpartySettlementPanel';

const address = (n:number) => '0x'+n.toString(16).padStart(64,'0');
const contacts = [{handle:'Casey',walletAddress:address(2)},{handle:'Jordan',walletAddress:address(3)}];
const now=Date.UTC(2026,9,31,23);
const memories:RecalledMemory[]=Array.from({length:3},(_,i)=>{
 const purchase={id:'fixture-purchase-000'+i,owner:address(1),merchant:'Fixture merchant '+i,category:'food_delivery',amountUnits:'30000000',purchasedAtMs:now-(i+4)*DAY_MS,timeZone:'UTC',localHour:23,recordedAtMs:now-3*DAY_MS,checkpoint:'123',balanceUnits:'123456789'};
 return [{blob_id:'test-purchase-'+i,text:'SOLVENCY_PURCHASE_V1 '+JSON.stringify(purchase),category:'habit_regret' as const,namespace:'test-only'},...(i<2?[{blob_id:'test-rating-'+i,text:'SOLVENCY_REGRET_V1 '+JSON.stringify({...purchase,verdict:'regretted',intensity:4,checkedAtMs:now-DAY_MS}),category:'habit_regret' as const,namespace:'test-only'}]:[])];
}).flat();
memories.push({blob_id:'test-new-purchase',text:'SOLVENCY_PURCHASE_V1 '+JSON.stringify({id:'fixture-purchase-new',owner:address(1),merchant:'Fixture recent purchase',category:'shopping',amountUnits:'1000000',purchasedAtMs:now-DAY_MS,timeZone:'UTC',localHour:23,recordedAtMs:now,checkpoint:'123',balanceUnits:'123456789'}),category:'habit_regret',namespace:'test-only'});
const additionalPurchase={id:'fixture-purchase-0003',owner:address(1),merchant:'Fixture earlier purchase',category:'workspace',amountUnits:'30000000',purchasedAtMs:now-7*DAY_MS,timeZone:'UTC',localHour:23,recordedAtMs:now-3*DAY_MS,checkpoint:'123',balanceUnits:'123456789'};
memories.push({blob_id:'test-purchase-3',text:'SOLVENCY_PURCHASE_V1 '+JSON.stringify(additionalPurchase),category:'habit_regret',namespace:'test-only'},{blob_id:'test-rating-3',text:'SOLVENCY_REGRET_V1 '+JSON.stringify({...additionalPurchase,verdict:'worth_it',intensity:0,checkedAtMs:now-DAY_MS}),category:'habit_regret',namespace:'test-only'});
const fixtureSplits:import('../../src/lib/onchain-user-manager').OnChainGroupSplit[]=[
 {splitId:address(9),creator:address(2),title:'Fixture shared bill',totalBillUsdc:30,creatorShareUsdc:15,createdAtMs:now-DAY_MS,fundingDeadlineMs:now+DAY_MS,isActive:true,isCancelled:false,pendingUpfront:0,participants:[{debtor:address(1),amountOwedUsdc:15,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}]},
 {splitId:address(11),creator:address(3),title:'Fixture second bill',totalBillUsdc:20,creatorShareUsdc:10,createdAtMs:now-DAY_MS,fundingDeadlineMs:now+DAY_MS,isActive:true,isCancelled:false,pendingUpfront:0,participants:[{debtor:address(1),amountOwedUsdc:10,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}]},
 {splitId:address(12),creator:address(1),title:'Fixture creator bill',totalBillUsdc:12,creatorShareUsdc:6,createdAtMs:now-DAY_MS,fundingDeadlineMs:now+DAY_MS,isActive:true,isCancelled:false,pendingUpfront:0,participants:[{debtor:address(2),amountOwedUsdc:6,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}]},
];
const rule:RecalledMemory={blob_id:'fixture-rule',text:'SOLVENCY_RULE_V1 '+JSON.stringify({subject:address(2),upfrontAboveUsdc:40,excludeAlcohol:true,fundingPolicy:'adaptive'}),namespace:'test-only',category:'social_split_trust'};
memories.push(rule);
declare global { interface Window { __formResult?: unknown; __recalls?:number; } }

function Preview() {
  const [view,setView]=useState('Expenses'),[disabled,setDisabled]=useState(false),[handle,setHandle]=useState('');
  const [floor,setFloor]=useState(0),[friends,setFriends]=useState<FriendInput[]>([]);
  const [recallFails,setRecallFails]=useState(false);
  const [proof,setProof]=useState(false),[drawerContacts,setDrawerContacts]=useState(contacts),[protect,setProtect]=useState(false);
  const [failPayment,setFailPayment]=useState(false),[paymentError,setPaymentError]=useState('');
  const result=(value:unknown)=>{window.__formResult=value;};
  const room=spendingRoom(123.456789,23.456789,10,memories,address(1),now);
  const recallFixture:()=>Promise<import('../../src/lib/financial-insights').MemoryInsights>=async()=>{window.__recalls=(window.__recalls||0)+1;if(recallFails)throw new Error('Fixture recall unavailable');return {memories:[{blob_id:'fixture-rule',text:'SOLVENCY_RULE_V1 '+JSON.stringify({subject:address(2),upfrontAboveUsdc:40,excludeAlcohol:true,fundingPolicy:'adaptive'}),namespace:'test-only',category:'social_split_trust'}],verifiedSettlements:[],rejectedEvidenceCount:0};};
  const profile:OnChainUserProfile={profileId:address(10),wallet:address(1),handle:'Fixture owner',memwalAccountId:address(4),safeFloorUsdc:23.456789,contacts:drawerContacts,usdcBalance:123.456789,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true};
  return <div className="workspace-experience llm-experience" style={{background:'var(--product-canvas)'}}><main className="app-shell" style={{minHeight:'100vh'}}><WorkspaceHeader ready memoryCount={memories.length} memoryView={view==='Memory'} recalled onRefreshMemory={()=>result('refresh-learning')} onAccount={()=>setView('Profile')} onHome={()=>setView('Expenses')} onMemory={()=>setView('Memory')} onProof={()=>setProof(true)} walletControl={<button>0x1234…abcd</button>}/><div className="workspace-stage" data-ready="true">
    <p className="eyebrow">Isolated UI test · fixture data · no wallet or transactions</p>
    <SpendingOverview room={room} recalled checkpoint="123" disabled={disabled} onRecall={()=>result('recall')} onProtect={value=>result(value)}/>
    <WorkspaceNavigation view={primaryViews.includes(view as typeof primaryViews[number])?view as WorkspaceView:'Account'} onChange={value=>{setView(value);window.__formResult=undefined;}} regretCount={1} settlementCount={2}/>
    <nav className="product-actions fixture-tools" aria-label="Fixture screens">{['Expenses','Regret','Memory','Profile','Savings','Permissions','Session'].map(label=><button className="button-quiet" key={label} aria-current={view===label?'page':undefined} onClick={()=>{setView(label);window.__formResult=undefined;}}>{label}</button>)}</nav>
    <label className="checkbox-row"><input type="checkbox" checked={disabled} onChange={event=>setDisabled(event.target.checked)}/>Disable form</label>
    <label className="checkbox-row"><input type="checkbox" checked={recallFails} onChange={event=>setRecallFails(event.target.checked)}/>Fail memory recall</label>
    <label className="checkbox-row"><input type="checkbox" checked={failPayment} onChange={event=>setFailPayment(event.target.checked)}/>Fail payment preparation</label>
    {<div hidden={view!=='Expenses'} role="tabpanel" aria-label="Split a Bill"><SmartSplitEnginePanel wallet={address(1)} contacts={contacts} memories={[]} disabled={disabled} onInspect={()=>setProof(true)} onRecall={recallFixture} onSmartSplit={async text=>{const draft=parseBillDraft(text,contacts,address(1));return {...await recallFixture(),draft};}} onCreate={async value=>{result(value);return false;}}/></div>}
    {view==='Regret'&&<div role="tabpanel" aria-label="Regret Check-In"><RegretCheckInPanel wallet={address(1)} memories={memories} now={now} disabled={disabled} availableAmount={room.available} protectionAmount={room.shield} room={room} checkpoint="123" onInspect={()=>setProof(true)} onProtect={()=>setProtect(true)} onRecall={()=>result('recall')} onSave={async payload=>{result(payload);return true;}}/></div>}
    {view==='Settlement'&&<div role="tabpanel" aria-label="Settle Shares"><CounterpartySettlementPanel contacts={contacts} onInspect={()=>setProof(true)} onOpenBill={()=>result('open-bill')} onPayAll={async ids=>{result({batch:ids});return true;}} wallet={address(1)} now={now} disabled={disabled} error={paymentError} splits={fixtureSplits} onPay={async(_split,amount,upfront)=>{if(failPayment){setPaymentError('Fixture provider coin read failed');return false;}setPaymentError('');result({amount,upfront});return true;}} onAction={()=>result('split-action')}/></div>}
    {view==='Memory'&&<MemoryAndRpcInspector contacts={contacts} memories={[]} logs={[]} disabled={disabled} historyStarted={false} historyHasMore={false} onRecall={()=>result('recall')} onRemember={(text,category)=>result({text,category})} onAnalyze={(text,category)=>result({text,category})} onPreference={(wallet,threshold,settings)=>result({wallet,threshold,...settings})} onImportSettlements={()=>result('import')} onRestore={category=>result(category)}/>}
    {view==='Profile'&&<IdentityAndContactsPanel profile={null} handle={handle} setHandle={setHandle} floor={floor} setFloor={setFloor} friends={friends} setFriends={setFriends} disabled={disabled} canSave onSave={draft=>result(draft)}/>}
    {view==='Savings'&&<CooldownVaultPanel balance={123.456789} floor={23.456789} registered vaults={[]} now={0} disabled={disabled} memoryDisabled={disabled} onLock={amount=>result({amount})} onUnlock={id=>result(id)} onReflect={text=>result(text)}/>}
    {view==='Session'&&<LearningSessionPreview/>}
    {view==='Permissions'&&<MemWalAccountPanel account={{accountId:address(4),owner:address(1),active:true,delegateAuthorized:false,delegateCount:0}} loaded delegatePublicKey={address(5)} disabled={disabled} onCreate={()=>result('create-account')} onAuthorize={()=>result('delegate-authorize')} onRevoke={()=>result('delegate-revoke')}/>}
  </div><WorkspaceFooter checkpoint="123" memoryCount={memories.length} onProof={()=>setProof(true)}/><ProofDrawer open={proof} onClose={()=>setProof(false)} wallet={address(1)} profile={profile} account={{accountId:address(4),owner:address(1),active:true,delegateAuthorized:true,delegateCount:1}} memories={memories} logs={[]} disabled={disabled} onRecall={()=>result('recall')} onSaveContacts={async friends=>{setDrawerContacts(friends.map(({handle,walletAddress})=>({handle,walletAddress})));result({savedContacts:friends});return true;}} onAccount={()=>{setProof(false);setView('Profile');}} onMemory={()=>{setProof(false);setView('Memory');}} onSavings={()=>{setProof(false);setView('Savings');}}/>{protect&&<VaultLockDialog open initialAmount={room.shield} balance={123.456789} floor={23.456789} disabled={disabled} onClose={()=>setProtect(false)} onLock={amount=>{result({amount});}}/>}</main></div>;
}

function LearningSessionPreview(){
 const [wallet,setWallet]=useState(address(1)),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[fail,setFail]=useState(false),[phase,setPhase]=useState('idle'),[count,setCount]=useState(0);
 const finish=useRef<(()=>void)|null>(null);
 const refresh=async()=>{setCount(n=>n+1);setBusy(true);setPhase('loading');try{await new Promise<void>(resolve=>{finish.current=resolve;});if(fail)throw Error('Fixture relayer unavailable');setPhase('ready');}catch(e){setPhase('error');throw e;}finally{setBusy(false);}};
 useLearningSession({wallet,ready,blocked:busy||blocked,refresh});
 return <section className="session-fixture panel"><h2>Session lifecycle verification</h2><label>Session wallet<select aria-label="Session wallet" value={wallet} onChange={e=>{setWallet(e.target.value);setReady(false);setPhase('idle');}}><option value={address(1)}>First wallet</option><option value={address(2)}>Second wallet</option></select></label><label><input type="checkbox" checked={ready} onChange={e=>setReady(e.target.checked)}/>Owned profile and memory authorized</label><label><input type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)}/>Block session requests</label><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>Fail session learning</label><output aria-label="Session refresh count">{count}</output><p role="status">{phase}</p><button onClick={()=>finish.current?.()} disabled={!busy}>Finish learning read</button><button onClick={()=>void refresh().catch(()=>{})} disabled={busy||!ready}>Retry personal learning</button><SpendingOverview room={spendingRoom(123.456789,23.456789,10,memories,address(1),now)} recalled={phase==='ready'} checkpoint="123" disabled={busy} onRecall={()=>void refresh().catch(()=>{})} onProtect={()=>{}}/></section>;
}

createRoot(document.getElementById('ui-root')!).render(<Preview/>);
