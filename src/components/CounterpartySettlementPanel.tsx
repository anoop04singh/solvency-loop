"use client";
import type { OnChainGroupSplit } from '@/lib/onchain-user-manager';
import { formatUsdc } from '@/lib/money';
interface Props { wallet: string; splits: OnChainGroupSplit[]; now: number; disabled: boolean; onPay: (s: OnChainGroupSplit, amount: number, upfront: boolean) => void; onAction: (id: string, action: 'activate_group_split' | 'cancel_group_split' | 'refund_escrow') => void; }
export function CounterpartySettlementPanel(p: Props) {
  return <section className="panel"><h2 className="text-lg font-semibold">Funding & settlement</h2><p className="text-sm text-tertiary">Manage bills involving your wallet. Pay your own share, fund an upfront deposit, or activate a bill you created.</p>
    {!p.splits.length && <p className="text-sm text-tertiary">No splits found for this wallet.</p>}
    <div className="space-y-xl">{p.splits.map(s => {
      const expired = p.now > s.fundingDeadlineMs, refundable = s.isCancelled || expired;
      return <div key={s.splitId} className="border-t border-secondary pt-lg space-y-md">
        <div className="flex flex-wrap justify-between gap-sm"><h3 className="text-sm font-semibold">{s.title}</h3><span className="badge">{s.isCancelled ? 'Cancelled' : s.isActive ? 'Active' : expired ? 'Funding expired' : 'Awaiting upfront funding'}</span></div>
        <div className="flex flex-wrap items-center gap-md"><details className="text-xs text-tertiary"><summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-focus-ring">Bill ID</summary><p className="font-mono break-all mt-sm">{s.splitId}</p></details><button className="button-secondary" onClick={async e=>{const button=e.currentTarget;try{await navigator.clipboard.writeText(window.location.origin+'/app?split='+s.splitId);button.textContent='Link copied';}catch{button.textContent='Copy unavailable';}}}>Copy bill link</button></div>
        {!s.isActive && <p className="text-xs text-tertiary">Funding deadline: {new Date(s.fundingDeadlineMs).toLocaleString()}</p>}
        {s.participants.map(member => {
          const mine = member.debtor.toLowerCase() === p.wallet.toLowerCase();
          const canRefund = mine && !s.isActive && refundable && member.isFunded && !member.isSettled;
          const canFund = mine && !s.isActive && !refundable && member.requiresUpfrontEscrow && !member.isFunded;
          const canPay = mine && s.isActive && !member.isSettled;
          return <div key={member.debtor} className="flex flex-wrap items-center justify-between gap-md py-sm"><div className="min-w-0"><p className="text-xs font-mono break-all">{member.debtor}{mine ? ' (connected)' : ''}</p><p className="text-sm">{formatUsdc(member.amountOwedUsdc)} USDC · {member.isSettled ? 'Settled on chain' : member.isFunded ? 'Escrow funded' : member.requiresUpfrontEscrow ? 'Upfront funding required' : 'Unpaid'}</p></div>
            {canRefund ? <button className="button-secondary" disabled={p.disabled} onClick={() => p.onAction(s.splitId, 'refund_escrow')}>Refund my escrow</button>
            : (canFund || canPay) ? <button className="button" disabled={p.disabled} onClick={() => p.onPay(s, member.amountOwedUsdc, canFund)}>{canFund ? 'Fund upfront escrow' : 'Settle share'}</button> : null}
          </div>;
        })}
        {s.creator.toLowerCase() === p.wallet.toLowerCase() && !s.isActive && !s.isCancelled && <div className="flex flex-wrap gap-sm"><button className="button" disabled={p.disabled || s.pendingUpfront !== 0 || expired} onClick={() => p.onAction(s.splitId, 'activate_group_split')}>Activate funded split</button><button className="button-secondary" disabled={p.disabled} onClick={() => p.onAction(s.splitId, 'cancel_group_split')}>Cancel pending split</button></div>}
      </div>;
    })}</div>
  </section>;
}
