"use client";
import { formatUsdc } from '@/lib/money';
import type { ComputedParticipantShare } from '@/lib/split-rules';
export type { ComputedParticipantShare } from '@/lib/split-rules';
interface Props { title: string; setTitle: (v: string) => void; food: number; setFood: (v: number) => void; drinks: number; setDrinks: (v: number) => void; enabled: boolean; setEnabled: (v: boolean) => void; shares: ComputedParticipantShare[]; total: number; creatorShare: number; error: string; memoryCount: number; disabled: boolean; onCreate: () => void; }
export function SmartSplitEnginePanel(p: Props) {
  return <section className="panel"><h2 className="text-lg font-semibold">Smart split & upfront escrow</h2><p className="text-sm text-tertiary">Food is shared four ways. Saved wallet-specific rules determine alcohol exclusions and upfront funding above the rule threshold.</p>
    <label className="flex items-center gap-sm text-sm"><input type="checkbox" checked={p.enabled} onChange={e => p.setEnabled(e.target.checked)}/>Apply recalled rules ({p.memoryCount} memories loaded)</label>
    <label className="block space-y-sm text-sm" htmlFor="split-title">Expense title<input id="split-title" className="field" value={p.title} maxLength={120} onChange={e => p.setTitle(e.target.value)}/></label>
    <div className="grid gap-md sm:grid-cols-2"><label className="space-y-sm text-sm" htmlFor="food">Food subtotal (USDC)<input id="food" type="number" min="0" step="0.000001" className="field" value={p.food} onChange={e => p.setFood(Number(e.target.value))}/></label><label className="space-y-sm text-sm" htmlFor="drinks">Drinks subtotal (USDC)<input id="drinks" type="number" min="0" step="0.000001" className="field" value={p.drinks} onChange={e => p.setDrinks(Number(e.target.value))}/></label></div>
    {p.error && <p className="text-sm text-error-primary" role="status">{p.error}</p>}
    <div className="divide-y border-secondary">{p.shares.map(s => <div key={s.handle} className="flex flex-wrap justify-between items-center gap-sm py-md"><div><p className="font-medium text-sm">{s.handle} · {s.ruleApplied}</p><p className="text-xs font-mono text-tertiary break-all">{s.walletAddress}</p></div><div className="text-right"><p className="font-mono text-sm">{formatUsdc(s.amountUsdc)} USDC</p>{s.requiresUpfrontEscrow && <span className="badge">Upfront funding required</span>}</div></div>)}</div>
    <div className="border-t border-secondary pt-md text-sm space-y-xs"><p>Total: <strong>{formatUsdc(p.total)} USDC</strong></p><p className="text-tertiary">Your creator share: {formatUsdc(p.creatorShare)} USDC</p></div>
    <p className="text-xs text-tertiary">A split with upfront shares starts pending. Those participants deposit first; you then activate it. Deposits can be refunded if you cancel or funding expires after 24 hours.</p>
    <button className="button w-full" disabled={p.disabled || !!p.error || p.total <= 0} onClick={p.onCreate}>Create split on Sui Mainnet</button>
  </section>;
}
