"use client";
import {useState,useSyncExternalStore} from 'react';
import {Fingerprint,ShieldCheck} from 'lucide-react';
import {memorySessionStatus,memorySessionVersion,subscribeMemorySession} from '@/lib/memory-session';
import {StepDialog} from './StepDialog';

export function MemorySessionControl(p:{wallet:string;accountId:string;now:number;disabled:boolean;chosen:boolean;onEnable:()=>Promise<boolean>;onIndividual:()=>void}){
 useSyncExternalStore(subscribeMemorySession,memorySessionVersion,()=>0);
 const session=memorySessionStatus(p.wallet);
 const enabled=session?.accountId===p.accountId;
 const [open,setOpen]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function authorize(){
  setBusy(true);
  setError('');
  try {
   if(await p.onEnable())setOpen(false);
   else setError('The session was not authorized.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="agent-session-controls">
  <div><ShieldCheck size={15}/><span>{enabled?'Quiet memory is on':p.chosen?'Individual memory approvals':'Choose how to authorize memory'}</span></div>
  <div>{!enabled&&<button className="agent-text-button" disabled={p.disabled} onClick={()=>{setConsent(false);setError('');setOpen(true);}}><Fingerprint size={14}/>Enable quiet memory</button>}
  <button className="agent-text-button" disabled={p.disabled} onClick={p.onIndividual}>{enabled?'Turn off quiet memory':'Use individual approvals'}</button></div>
  <StepDialog open={open} title="Quiet memory" question="Keep quiet memory on in this tab?" stepKey="memory-consent" onClose={()=>setOpen(false)} onNext={()=>void authorize()} canNext={consent&&!p.disabled} busy={busy} error={error} nextLabel="Authorize once with my wallet" hint="A temporary browser key is discarded when you turn quiet memory off, reload, or change wallets.">
   <p>SolvencyLoop can recall your linked memory and save standing preferences in the background. Ordinary chat stays in this tab. Each wallet grant lasts up to one hour. Your next request after expiry asks you to renew it.</p>
   <p className="field-help">Automatic payments require a separate funded allowance. Turning quiet memory off leaves your MemWal delegate and any allowance in place.</p>
   <label className="checkbox-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I allow scoped memory requests and automatic learning in this tab.</label>
  </StepDialog>
 </div>;
}
