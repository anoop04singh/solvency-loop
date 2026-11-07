// Isolated browser fixtures are intercepted by Playwright; no application route serves this file.
import {useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {AgentWorkspace,AgentWorkspaceNavigation,type AgentReceipt} from '../../src/components/AgentWorkspace';
import {AgentHeader,AgentFooter} from '../../src/components/AgentChrome';
import {SmartSplitEnginePanel} from '../../src/components/SmartSplitEnginePanel';
import {MemoryAndRpcInspector} from '../../src/components/MemoryAndRpcInspector';
import {spendingRoom} from '../../src/lib/financial-insights';
import {computeExpense} from '../../src/lib/expense';
import {AgentReplyError,GEMINI_MODEL,type AgentTurn,type SplitReviewDetails} from '../../src/lib/agent-types';
import type {WorkspaceView} from '../../src/components/WorkspaceNavigation';
import type {BillDraft} from '../../src/lib/bill-draft';
import {LEARNED_MARKER,learnedNamespace,type LearningChoice} from '../../src/lib/agent-learning';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const profile={profileId:a(3),wallet:a(1),handle:'Fixture owner',memwalAccountId:a(4),safeFloorUsdc:20,contacts:[{handle:'Casey',walletAddress:a(2)}],usdcBalance:200,suiBalance:1,latestCheckpoint:'123456',isRegisteredOnChain:true};
const now=Date.UTC(2026,10,2,10),room=spendingRoom(200,20,0,[],a(1),now,'UTC');
declare global {interface Window {__agentRequests?:string[];__agentConfirmed?:string;__agentEdited?:string;__agentSplitReview?:SplitReviewDetails;}}
function Preview(){
 const [turns,setTurns]=useState<AgentTurn[]>([]),[receipts,setReceipts]=useState<Record<string,AgentReceipt>>({}),[view,setView]=useState<WorkspaceView>('Agent'),[draft,setDraft]=useState<BillDraft|null>(null),[busy,setBusy]=useState(false),[fail,setFail]=useState(false),[hold,setHold]=useState(false),[restored,setRestored]=useState(false),[disabled,setDisabled]=useState(false),[proof,setProof]=useState(false);
 const [autopilot,setAutopilot]=useState(false),finish=useRef<(()=>void)|null>(null);
 const [preference,setPreference]=useState<LearningChoice>({kind:'bill_category',topic:'north market',value:'groceries'});
 const send=async(text:string,draftOnly=false)=>{
  window.__agentRequests=[...window.__agentRequests||[],text];setBusy(true);
  try{if(hold)await new Promise<void>(resolve=>{finish.current=resolve;});if(fail)throw new AgentReplyError('Gemini could not reply. Try sending your message again.');
   const bill:BillDraft={title:'Fixture user dinner',total:'16.500001',mode:'equal',items:[],people:[{id:'fixture-person',handle:'Casey',walletAddress:a(2),customAmount:'',upfront:false}]};
   const needsContact=text==='Split dinner with an unknown contact';
   const turn:AgentTurn={id:'fixture-turn-'+turns.length,threadId:'fixture-thread-0001',owner:a(1),user:text,reply:needsContact?'Which saved contact should share this bill?':'Review these calculated shares before wallet approval.',action:needsContact?{kind:'none'}:{kind:'split',draft:bill,allocation:computeExpense(a(1),bill.people,bill.total,bill.mode,[],true)},createdAtMs:now,checkpoint:'123456',model:GEMINI_MODEL,contextBlobIds:[],blobId:autopilot&&!draftOnly?'fixture-committed-audit':''};
   setTurns(old=>[...old,turn]);if(autopilot&&!draftOnly)setReceipts(old=>({...old,[turn.id]:{digest:'fixture-funded-confirmed-digest',state:'confirmed'}}));return true;
  }finally{setBusy(false);}
 };
 return <div className={'workspace-experience llm-experience'+(view==='Agent'?' agent-mode':'')}><main className="app-shell"><AgentHeader ready view={view} memoryCount={turns.length} recalled loading={busy} onNavigate={setView} onProof={()=>setProof(true)} walletControl={<button>0x0000…0001</button>}/><div className="workspace-stage" data-ready="true"><details className="fixture-tools"><summary>Isolated agent fixture controls</summary><label><input type="checkbox" checked={autopilot} onChange={e=>setAutopilot(e.target.checked)}/>Enable fixture funded authority</label><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>Fail agent reply</label><label><input type="checkbox" checked={hold} onChange={e=>setHold(e.target.checked)}/>Hold agent response</label><button onClick={()=>finish.current?.()}>Finish response</button><label><input type="checkbox" checked={restored} onChange={e=>setRestored(e.target.checked)}/>Restored conversation only</label><label><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/>Disable agent</label></details>
 {view==='Agent'?<AgentWorkspace autopilotActive={autopilot} profile={profile} room={room} recalled memoryCount={turns.length} turns={turns} actionable={restored?[]:turns.map(t=>t.id)} receipts={receipts} saved={[]} now={now} disabled={disabled||busy} busy={busy} pendingShares={0} regretCount={0} onSend={send} onConfirm={async (turn,details)=>{window.__agentConfirmed=turn.id;window.__agentSplitReview=details;setReceipts(old=>({...old,[turn.id]:{digest:'fixture-confirmed-digest',state:'confirmed'}}));return true;}} onInspect={()=>setProof(true)} onEdit={turn=>{window.__agentEdited=turn.id;if(turn.action.kind==='split')setDraft(turn.action.draft);setView('Expenses');}} onNew={()=>{setTurns([]);setReceipts({});}} onNavigate={setView}/>:view==='Expenses'?<SmartSplitEnginePanel wallet={a(1)} contacts={profile.contacts} memories={[]} initialDraft={draft} disabled={disabled} onRecall={async()=>({memories:[],verifiedSettlements:[],rejectedEvidenceCount:0})} onSmartSplit={async()=>{throw Error('Not part of this fixture');}} onCreate={async()=>false}/>:view==='Memory'?<MemoryAndRpcInspector wallet={profile.wallet} contacts={[]} memories={[{blob_id:'fixture-learned',category:'social_split_trust',namespace:learnedNamespace(profile.wallet),text:LEARNED_MARKER+' '+JSON.stringify({...preference,owner:profile.wallet,updatedAtMs:now,revision:'fixture-learning-0001'})}]} logs={[]} disabled={false} historyStarted={false} historyHasMore={false} onImportSettlements={()=>{}} onRecall={()=>{}} onAnalyze={()=>{}} onRemember={()=>{}} onPreference={()=>{}} onRestore={()=>{}} onLearnedChange={choice=>{setPreference(choice);return true;}}/>:<p>{view} manual workspace selected</p>}
 <AgentWorkspaceNavigation view={view} onNavigate={setView}/></div><AgentFooter checkpoint="123456" memoryCount={turns.length} onProof={()=>setProof(true)}/>{proof&&<aside role="dialog" aria-label="Fixture proof"><p>fixture-committed-conversation</p><button onClick={()=>setProof(false)}>Close proof</button></aside>}</main></div>;
}
createRoot(document.getElementById('ui-root')!).render(<Preview/>);
