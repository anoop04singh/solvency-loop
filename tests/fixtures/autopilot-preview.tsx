// Served only by Playwright interception. No wallet signing or execution exists here.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AutopilotPanel} from '../../src/components/AutopilotPanel';
import {MemorySessionControl} from '../../src/components/MemorySessionControl';
import type {AutopilotState} from '../../src/lib/autopilot-types';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),now=Date.UTC(2026,10,3,10);
const profile={profileId:a(3),wallet:a(1),handle:'Fixture owner',memwalAccountId:a(4),safeFloorUsdc:20,contacts:[{handle:'Casey',walletAddress:a(2)}],usdcBalance:200,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true};
declare global {interface Window {__autopilotResult?:unknown;}}
function Preview(){
 const [funded,setFunded]=useState(false),[blocked,setBlocked]=useState(false),[chosen,setChosen]=useState(false),[executorIsOwner,setExecutorIsOwner]=useState(false),[fail,setFail]=useState(false),[rejected,setRejected]=useState(false);
 const result=(value:unknown)=>{window.__autopilotResult=value;return Promise.resolve(true);};
 const state:AutopilotState={configured:true,social:null,groups:[],vault:funded?{id:a(8),owner:a(1),profileId:a(3),memoryId:a(4),memoryDelegate:a(9),executor:a(7),epoch:'0',balanceUnits:'100000000',perTxUnits:'25000000',dailyUnits:'40000000',expiresAtMs:now+86400000,active:true,allowCreate:true,allowIncoming:true,allowCooldown:false,payees:[a(2)],history:[{atMs:now-1,amountUnits:'10000000'}]}:null};
 return <div className="workspace-experience llm-experience"><main className="app-shell"><div className="workspace-stage" data-ready="true"><p className="eyebrow">Isolated autonomy UI fixture · no live transactions</p><label><input type="checkbox" checked={funded} onChange={e=>setFunded(e.target.checked)}/>Show funded allowance</label><label><input type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)}/>Routine agent request is busy</label><label><input type="checkbox" checked={executorIsOwner} onChange={e=>setExecutorIsOwner(e.target.checked)}/>Executor is the owner wallet</label><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>Reject policy submission</label><AutopilotPanel profile={profile} state={state} now={now} disabled={blocked} revokeDisabled={false} executorAddress={executorIsOwner?profile.wallet:a(7)} operatorReady error={rejected?'The rolling 24-hour limit must be at least the per-transaction limit.':undefined} sessionControl={<MemorySessionControl wallet={profile.wallet} accountId={profile.memwalAccountId} now={now} disabled={blocked} chosen={chosen} onEnable={async()=>{setChosen(true);return result('session-authorized');}} onIndividual={()=>{setChosen(true);void result('individual');}}/>} onSave={p=>{if(fail){setRejected(true);return Promise.resolve(false);}return result({policy:p});}} onManage={(action,amount)=>result({action,amount})} onPublish={settings=>result({public:settings})} onGroup={p=>result({group:p})} onConsent={(id,accept)=>result({id,accept})} onRefresh={()=>{}}/></div></main></div>;
}
createRoot(document.getElementById('ui-root')!).render(<Preview/>);
