"use client";
import { useEffect, useRef } from 'react';
import { ArrowUpRight, Check, Database, Fingerprint, ShieldCheck, Wallet, X } from 'lucide-react';
import type { RecalledMemory } from '@/lib/memory-protocol';
import type { OnChainUserProfile } from '@/lib/onchain-user-manager';
import type { WalletMemWalAccount } from '@/lib/memwal-account';

interface Props {
  open: boolean; onClose: () => void; wallet: string; profile: OnChainUserProfile | null;
  account: WalletMemWalAccount | null; memories: RecalledMemory[]; logs: string[];
  onAccount: () => void; onMemory: () => void;
}
export function ProofDrawer(p: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (p.open && !element.open) element.showModal();
    if (!p.open && element.open) element.close();
    if (!p.open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [p.open]);
  return <dialog ref={dialog} className="proof-drawer" aria-labelledby="proof-title" onClose={p.onClose} onCancel={p.onClose} onClick={e => { if (e.target === e.currentTarget) p.onClose(); }}>
    <div className="proof-sheet">
      <header className="proof-header"><div><p className="eyebrow">Behind the balance</p><h2 id="proof-title">Your account. Your proof.</h2></div><button className="icon-button" aria-label="Close account details" onClick={p.onClose}><X size={19}/></button></header>
      <div className="proof-body">
        <section className="proof-section"><div className="proof-section-label"><Wallet size={17}/><h3>Connected wallet</h3></div><p className="proof-address">{p.wallet || 'Connect a wallet to see your account.'}</p>{p.wallet && <button className="text-action" onClick={p.onAccount}>Manage profile & contacts <ArrowUpRight size={15}/></button>}</section>
        <section className="proof-section"><div className="proof-section-label"><ShieldCheck size={17}/><h3>On-chain state</h3></div>{p.profile ? <><p className="proof-check"><Check size={15}/>Read through Tatum · Sui Mainnet</p><dl className="proof-values"><div><dt>Checkpoint</dt><dd>#{p.profile.latestCheckpoint}</dd></div><div><dt>USDC balance</dt><dd>{p.profile.usdcBalance.toLocaleString('en-US',{maximumFractionDigits:6})} USDC</dd></div><div><dt>Profile</dt><dd>{p.profile.isRegisteredOnChain ? 'Registered to your wallet' : 'Not registered yet'}</dd></div></dl>{p.profile.profileId && <p className="proof-address">{p.profile.profileId}</p>}</> : <p className="proof-muted">Account state appears here after your wallet is connected and checked.</p>}</section>
        <section className="proof-section"><div className="proof-section-label"><Fingerprint size={17}/><h3>Your MemWal account</h3></div>{p.account ? <><p className="proof-address">{p.account.accountId}</p><dl className="proof-values"><div><dt>Account</dt><dd>{p.account.active ? 'Active' : 'Frozen'}</dd></div><div><dt>App access</dt><dd>{p.account.delegateAuthorized ? 'Authorized' : 'Not authorized'}</dd></div></dl></> : <p className="proof-muted">No memory account loaded. Your wallet remains the account owner.</p>}</section>
        <section className="proof-section"><div className="proof-section-label"><Database size={17}/><h3>Walrus memories <span className="proof-count">{p.memories.length}</span></h3></div><p className="proof-muted">Only memories you have recalled in this session are shown.</p>{!p.memories.length ? <p className="proof-empty">A little blank space, ready for what matters to you.</p> : <div className="proof-memories">{p.memories.map(m => <article key={m.namespace+m.blob_id}><p>{m.text}</p><details><summary>Storage reference</summary><p className="proof-address">{m.blob_id}</p></details></article>)}</div>}{p.wallet && <button className="text-action" onClick={p.onMemory}>Open your memory <ArrowUpRight size={15}/></button>}</section>
        <details className="proof-section"><summary className="proof-section-label">Recent activity</summary><div className="proof-log">{p.logs.length ? p.logs.map((l,i)=><p key={i}>{l}</p>) : <p>No recent activity.</p>}</div></details>
      </div>
      <footer className="proof-footer"><ShieldCheck size={15}/><p>Public chain records. Wallet-controlled access.</p></footer>
    </div>
  </dialog>;
}
