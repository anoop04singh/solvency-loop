// Isolated Playwright fixture. API replies are intercepted; no wallet or financial execution.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceActivity,WorkspaceActivityContext} from '../../src/components/WorkspaceActivity';
import {StepDialog} from '../../src/components/StepDialog';
import {requestMemory} from '../../src/lib/memory-api';
import type {AgentProgress} from '../../src/lib/agent-progress';
function Preview(){
 const inDialog=new URLSearchParams(window.location.search).has('dialog');
 const [events,setEvents]=useState<AgentProgress[]>([]),[state,setState]=useState('idle');
 const start=async()=>{
  setState('loading');setEvents([]);
  try{await requestMemory({action:'recall_all',walletAddress:'0x'+'1'.repeat(64)},async()=>({signature:'fixture-only'}),event=>setEvents(old=>[...old.filter(value=>value.stage!==event.stage),event]));setState('ready');}
  catch{setState('error');}
 };
 return <WorkspaceActivityContext.Provider value={events}><div className="workspace-experience llm-experience entry-experience"><main className="app-shell"><div className="workspace-stage"><p className="eyebrow">Isolated loading fixture · no wallet or transactions</p><header className="stage-intro"><h1>Your workspace is getting ready.</h1><p>A presentation test using intercepted responses.</p></header>{state==='idle'?<button onClick={()=>void start()}>Start sign-in fixture</button>:state==='ready'?<p role="status">Workspace ready</p>:<WorkspaceActivity signIn events={events} failed={state==='error'} title={state==='error'?'Personal insights could not load':'Preparing your workspace'} description="Your memories and confirmed payment history shape your personal insights.">{state==='error'&&<button className="button primary-commit" onClick={()=>void start()}>Retry sign-in</button>}</WorkspaceActivity>}</div>{inDialog&&<StepDialog open={state==='loading'} busy title="Prepare expense" question="Recalling your preferences" stepKey="loading" onClose={()=>{}} onNext={()=>{}}><label>Fixture detail<input aria-label="Fixture detail"/></label></StepDialog>}</main></div></WorkspaceActivityContext.Provider>;
}
createRoot(document.getElementById('ui-root')!).render(<Preview/>);
