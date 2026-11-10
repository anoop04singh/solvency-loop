// Playwright-intercepted presentation only. No wallet, network or signing handlers.
import {useState} from 'react';
import {WorkspaceActivity} from '../../src/components/WorkspaceActivity';
import {createRoot} from 'react-dom/client';
import {LoadingState} from '../../src/components/LoadingState';
import {MemWalAccountPanel} from '../../src/components/MemWalAccountPanel';
import {OnboardingProgress} from '../../src/components/OnboardingProgress';
import {IdentityAndContactsPanel,type FriendInput} from '../../src/components/IdentityAndContactsPanel';
import {FundRecoveryPanel} from '../../src/components/FundRecoveryPanel';
import RouteLoading from '../../src/app/app/loading';
import {QuietMemorySignIn} from '../../src/components/QuietMemorySignIn';
import {ProofDrawer} from '../../src/components/ProofDrawer';
import {AutopilotPanel} from '../../src/components/AutopilotPanel';
const address=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
declare global{interface Window{__entryAction?:unknown;__finishQuietApproval?:(success:boolean)=>void;}}
function Preview(){
 const [view,setView]=useState('Checking'),[disabled,setDisabled]=useState(false),[handle,setHandle]=useState(''),[floor,setFloor]=useState(0),[friends,setFriends]=useState<FriendInput[]>([]);
 const [proof,setProof]=useState(false),[authorizing,setAuthorizing]=useState(false);
 const profile={profileId:address(3),wallet:address(1),handle:'Fixture owner',memwalAccountId:address(2),safeFloorUsdc:10,contacts:[],usdcBalance:20,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true};
 const vault={id:address(8),owner:profile.wallet,profileId:profile.profileId,memoryId:profile.memwalAccountId,memoryDelegate:address(6),executor:address(7),balanceUnits:'100000000',perTxUnits:'25000000',dailyUnits:'40000000',expiresAtMs:Date.now()+86400000,active:true,epoch:'0',allowCreate:false,allowIncoming:false,allowCooldown:true,payees:[],history:[]};
 const loaded=view!=='Checking',step=['Permission','Authorized','Frozen','Recovery'].includes(view)?2:view==='Profile'?3:1;
 const account=view==='Create account'?null:{accountId:address(2),owner:address(1),active:!['Frozen','Recovery'].includes(view),delegateAuthorized:view==='Authorized',delegateCount:0};
 return <div className="workspace-experience llm-experience entry-experience"><main className="app-shell"><div className="workspace-stage">
 <details className="fixture-tools"><summary>Isolated entry fixture controls</summary>{['Checking','Create account','Permission','Authorized','Frozen','Profile','Recovery','Quiet sign-in','Route loading'].map(v=><button key={v} onClick={()=>setView(v)}>{v}</button>)}<label><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/>Disable account actions</label></details>
 {view==='Route loading'?<RouteLoading/>:<><header className="stage-intro"><p className="eyebrow">Your wallet. Your starting point.</p><h1>{view==='Quiet sign-in'?'Your workspace is ready to sign in.':'Set up your account.'}</h1><p>{view==='Quiet sign-in'?'Choose how this tab can access your linked memory.':'Create or link your memory account, authorize access, then finish your profile.'}</p></header><div className="space-y-xl onboarding-flow">{view!=='Quiet sign-in'&&<OnboardingProgress step={step} loaded={loaded}/>}
 {view==='Quiet sign-in'?<><QuietMemorySignIn disabled={disabled||authorizing} activity={authorizing?<WorkspaceActivity inline events={[{stage:'authorization',state:'active',at:1}]} title="Quiet Memory sign-in activity"/>:undefined} onEnable={()=>{window.__entryAction='quiet-sign-in';setAuthorizing(true);return new Promise<boolean>(resolve=>{window.__finishQuietApproval=success=>{setAuthorizing(false);resolve(success);};});}} onIndividual={()=>{window.__entryAction='individual';}}/><button className="button-quiet" onClick={()=>setProof(true)}>Open account and proof</button><ProofDrawer open={proof} onClose={()=>setProof(false)} wallet={profile.wallet} profile={profile} account={{accountId:profile.memwalAccountId,owner:profile.wallet,active:true,delegateAuthorized:true,delegateCount:1}} memories={[]} logs={[]} onAccount={()=>{}} onMemory={()=>{}} ownerControls={<AutopilotPanel profile={profile} state={{configured:true,vault,social:null,groups:[]}} now={Date.now()} disabled={disabled} revokeDisabled={false} recoveryOnly operatorReady executorAddress={address(7)} sessionControl={null} onSave={async()=>false} onManage={async action=>{window.__entryAction=action;return true;}} onPublish={async()=>false} onGroup={async()=>false} onConsent={async()=>false} onRefresh={()=>{}}/>}/></>:view==='Checking'?<LoadingState title="Checking your account" description="Looking for the profile and memory account your wallet already owns. Please wait for the live checks."/>:view==='Profile'?<IdentityAndContactsPanel onboarding profile={null} handle={handle} setHandle={setHandle} floor={floor} setFloor={setFloor} friends={friends} setFriends={setFriends} disabled={disabled} canSave onSave={async d=>{window.__entryAction=d;return true;}}/>:<MemWalAccountPanel key={view} account={account} loaded={loaded} delegatePublicKey={address(3)} disabled={disabled} onCreate={()=>{window.__entryAction='create';}} onAuthorize={()=>{window.__entryAction='authorize';}} onRevoke={()=>{window.__entryAction='revoke';}}/>}
 {view==='Recovery'&&<FundRecoveryPanel wallet={address(1)} splits={[]} vaults={[]} now={Date.UTC(2026,10,4)} disabled={disabled} onCancel={()=>{}} onRefund={()=>{}} onUnlock={()=>{}}/>}</div></>}
 </div></main></div>;
}
createRoot(document.getElementById('ui-root')!).render(<Preview/>);
