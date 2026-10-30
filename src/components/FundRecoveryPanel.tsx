"use client";
import type { OnChainCooldownVault, OnChainGroupSplit } from '@/lib/onchain-user-manager';
import { formatUsdc } from '@/lib/money';
interface Props {
  wallet: string; splits: OnChainGroupSplit[]; vaults: OnChainCooldownVault[]; now: number; disabled: boolean;
  onCancel: (id: string) => void; onRefund: (id: string) => void; onUnlock: (id: string) => void;
}
export function FundRecoveryPanel(p: Props) {
  const cancellable = p.splits.filter(s => s.creator === p.wallet && !s.isActive && !s.isCancelled);
  const refundable = p.splits.filter(s => !s.isActive && (s.isCancelled || p.now > s.fundingDeadlineMs) && s.participants.some(m => m.debtor === p.wallet && m.isFunded && !m.isSettled));
  return <section className="panel"><h2 className="text-lg font-semibold">Recover existing USDC</h2>
    <p className="text-sm text-tertiary">Your wallet-owned MemWal account must remain linked to your profile. You can recover previously committed funds while restoring memory access. Complete onboarding to make new payments or lock new funds.</p>
    {!cancellable.length && !refundable.length && !p.vaults.length && <p className="text-sm text-tertiary">No pending splits or cooldown vaults to recover.</p>}
    {cancellable.map(s => <div key={s.splitId} className="flex flex-wrap items-center justify-between gap-md border-t border-secondary pt-md"><p className="text-sm">{s.title}</p><button className="button-secondary" disabled={p.disabled} onClick={() => p.onCancel(s.splitId)}>Cancel pending split</button></div>)}
    {refundable.map(s => <div key={s.splitId} className="flex flex-wrap items-center justify-between gap-md border-t border-secondary pt-md"><p className="text-sm">{s.title}</p><button className="button-secondary" disabled={p.disabled} onClick={() => p.onRefund(s.splitId)}>Refund my escrow</button></div>)}
    {p.vaults.map(v => <div key={v.vaultId} className="flex flex-wrap items-center justify-between gap-md border-t border-secondary pt-md"><p className="text-sm">{formatUsdc(v.amountUsdc)} USDC · unlocks {new Date(v.unlockTimeMs).toLocaleString()}</p><button className="button-secondary" disabled={p.disabled || p.now < v.unlockTimeMs} onClick={() => p.onUnlock(v.vaultId)}>Unlock matured vault</button></div>)}
  </section>;
}
