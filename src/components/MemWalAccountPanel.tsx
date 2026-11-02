"use client";
import { useState } from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { WalletMemWalAccount } from '@/lib/memwal-account';
import { WorkspaceArtwork } from './WorkspaceArtwork';
interface Props {
  account:WalletMemWalAccount|null; loaded:boolean; profileAccountId?:string; delegatePublicKey:string;
  disabled:boolean; onCreate:()=>void; onAuthorize:()=>void; onRevoke:()=>void;
}
export function MemWalAccountPanel(p:Props) {
  const [consent,setConsent]=useState(false);
  return <section className="panel permission-panel">
    <div className="panel-heading"><div><p className="eyebrow">Owned by your wallet</p><h2>Your memory account</h2><p className="panel-description">Create or reuse your personal MemWal account, then choose whether to authorize this app.</p></div><WorkspaceArtwork kind="memory" className="panel-art"/></div>
    <span className="badge">{!p.loaded?'Not loaded':!p.account?'Setup required':!p.account.active?'Frozen':p.account.delegateAuthorized?'Access authorized':'Your permission is needed'}</span>
    {!p.loaded?<p className="field-help">Checking your wallet for an existing memory account…</p>:!p.account?<div className="form-actions"><button className="button" disabled={p.disabled} onClick={p.onCreate}>Create my memory account<ArrowRight size={16} aria-hidden="true"/></button><p className="action-caption">Review the request in your wallet. SUI covers network fees.</p></div>:<>
      {p.account.delegateAuthorized?<div className="permission-confirmed"><CheckCircle2 size={22} aria-hidden="true"/><div><h3>Memory access is authorized</h3><p>The app can use this account while your authorization stays active.</p></div></div>:<div className="permission-disclosure"><ShieldCheck size={21} aria-hidden="true"/><div><h3>Review what you’re allowing</h3><p>SolvencyLoop’s server can read and write every memory in this account, including memories from other apps. Your wallet keeps control of the account and its delegate keys.</p></div></div>}
      {!p.account.active&&<p className="form-validation">Reactivate your account in MemWal before using memory. You can still revoke this app’s delegate.</p>}
      {p.account.delegateAuthorized?<><button className="button-secondary" disabled={p.disabled} onClick={p.onRevoke}>Revoke app memory access</button><p className="field-help">Revocation blocks future requests. It does not remove plaintext, keys or copies a delegate already obtained; historical protection requires re-encryption.</p></>
        :<><label className="consent-row"><input type="checkbox" checked={consent} disabled={p.disabled} onChange={e=>setConsent(e.target.checked)}/><span>I understand and allow SolvencyLoop to read and write memories across this account.</span></label><button className="button w-full" disabled={p.disabled||!p.account.active||!consent} onClick={p.onAuthorize}>Authorize memory access<ArrowRight size={16} aria-hidden="true"/></button><p className="action-caption">Your wallet will ask for approval. SUI covers network fees.</p></>}
      {p.profileAccountId!==p.account.accountId&&<p className="next-step-note"><ArrowRight size={14} aria-hidden="true"/>Next, link this account when you create your profile.</p>}
      <details className="inline-details account-references"><summary>Account & app key details</summary><p className="field-help">Your MemWal account</p><p className="proof-address">{p.account.accountId}</p><p className="field-help">App delegate public key</p><p className="proof-address">{p.delegatePublicKey}</p></details>
    </>}
  </section>;
}
