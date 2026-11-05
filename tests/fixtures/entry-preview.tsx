// Playwright-intercepted presentation only. No wallet, network or signing handlers.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LoadingState} from '../../src/components/LoadingState';
import {MemWalAccountPanel} from '../../src/components/MemWalAccountPanel';
import {OnboardingProgress} from '../../src/components/OnboardingProgress';
import {IdentityAndContactsPanel,type FriendInput} from '../../src/components/IdentityAndContactsPanel';
import {FundRecoveryPanel} from '../../src/components/FundRecoveryPanel';
import RouteLoading from '../../src/app/app/loading';
const address=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
declare global{interface Window{__entryAction?:unknown;}}
function Preview(){
 const [view,setView]=useState('Checking'),[disabled,setDisabled]=useState(false),[handle,setHandle]=useState(''),[floor,setFloor]=useState(0),[friends,setFriends]=useState<FriendInput[]>([]);
 const loaded=view!=='Checking',step=['Permission','Authorized','Frozen','Recovery'].includes(view)?2:view==='Profile'?3:1;
 const account=view==='Create account'?null:{accountId:address(2),owner:address(1),active:!['Frozen','Recovery'].includes(view),delegateAuthorized:view==='Authorized',delegateCount:0};
 return <div className="workspace-experience llm-experience entry-experience"><main className="app-shell"><div className="workspace-stage">
 <details className="fixture-tools"><summary>Isolated entry fixture controls</summary>{['Checking','Create account','Permission','Authorized','Frozen','Profile','Recovery','Route loading'].map(v=><button key={v} onClick={()=>setView(v)}>{v}</button>)}<label><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/>Disable account actions</label></details>
 {view==='Route loading'?<RouteLoading/>:<><header className="stage-intro"><p className="eyebrow">Your wallet. Your starting point.</p><h1>Set up your account.</h1><p>Create or link your memory account, authorize access, then finish your profile.</p></header><div className="space-y-xl onboarding-flow"><OnboardingProgress step={step} loaded={loaded}/>
 {view==='Checking'?<LoadingState title="Checking your account" description="Looking for the profile and memory account your wallet already owns. Please wait for the live checks."/>:view==='Profile'?<IdentityAndContactsPanel onboarding profile={null} handle={handle} setHandle={setHandle} floor={floor} setFloor={setFloor} friends={friends} setFriends={setFriends} disabled={disabled} canSave onSave={async d=>{window.__entryAction=d;return true;}}/>:<MemWalAccountPanel key={view} account={account} loaded={loaded} delegatePublicKey={address(3)} disabled={disabled} onCreate={()=>{window.__entryAction='create';}} onAuthorize={()=>{window.__entryAction='authorize';}} onRevoke={()=>{window.__entryAction='revoke';}}/>}
 {view==='Recovery'&&<FundRecoveryPanel wallet={address(1)} splits={[]} vaults={[]} now={Date.UTC(2026,10,4)} disabled={disabled} onCancel={()=>{}} onRefund={()=>{}} onUnlock={()=>{}}/>}</div></>}
 </div></main></div>;
}
createRoot(document.getElementById('ui-root')!).render(<Preview/>);
