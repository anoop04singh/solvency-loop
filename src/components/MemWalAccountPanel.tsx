"use client";
import type { WalletMemWalAccount } from '@/lib/memwal-account';
interface Props {
  account: WalletMemWalAccount | null; loaded: boolean; profileAccountId?: string; delegatePublicKey: string;
  disabled: boolean; onCreate: () => void; onAuthorize: () => void; onRevoke: () => void;
}
export function MemWalAccountPanel(p: Props) {
  return <section className="panel">
    <div className="flex flex-wrap items-center justify-between gap-sm"><h2 className="text-lg font-semibold">Your memory account</h2><span className="badge">{!p.loaded ? 'Not loaded' : !p.account ? 'Setup required' : !p.account.active ? 'Frozen' : p.account.delegateAuthorized ? 'Access authorized' : 'Access not authorized'}</span></div>
    <p className="text-sm text-tertiary">Your Sui wallet owns your MemWal account. Existing accounts are discovered and reused automatically. Account creation and access changes require wallet approval and SUI gas.</p>
    {!p.loaded ? <p className="text-sm text-tertiary">Connect your wallet and refresh state to check for an existing account.</p>
      : !p.account ? <button className="button" disabled={p.disabled} onClick={p.onCreate}>Create my memory account</button>
      : <>
        <p className="text-xs font-mono break-all">Account: {p.account.accountId}</p>
        {p.profileAccountId !== p.account.accountId && <p className="text-sm text-tertiary">Save your profile below to link this account. Previous shared-account memories are not moved automatically.</p>}
        <p className="text-sm text-tertiary">Authorizing grants SolvencyLoop’s server permission to read and write every memory in this account, including memories from other apps. Your wallet keeps control of the account and its delegate keys.</p>
        <p className="text-xs font-mono text-tertiary break-all">App delegate public key: {p.delegatePublicKey}</p>
        {!p.account.active && <p className="text-sm text-warning-primary">Reactivate your account in MemWal before using memory. You can still revoke this app’s delegate.</p>}
        {p.account.delegateAuthorized ? <><button className="button-secondary" disabled={p.disabled} onClick={p.onRevoke}>Revoke app memory access</button><p className="text-xs text-tertiary">Revocation blocks further requests through this app. A delegate may retain access to older data or copies it already obtained; removing past access requires re-encryption.</p></>
          : <button className="button" disabled={p.disabled || !p.account.active} onClick={p.onAuthorize}>Authorize app memory access</button>}
      </>}
  </section>;
}
