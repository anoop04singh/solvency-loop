"use client";
import { useState } from 'react';
import type { OnChainCooldownVault } from '@/lib/onchain-user-manager';
import { formatUsdc, spendableUsdc } from '@/lib/money';
interface Props { balance: number; floor: number; registered: boolean; vaults: OnChainCooldownVault[]; now: number; disabled: boolean; memoryDisabled: boolean; onLock: (amount: number) => void; onUnlock: (id: string) => void; onReflect: (note: string) => void; }
export function CooldownVaultPanel(p: Props) {
  const [amount, setAmount] = useState(0), [note, setNote] = useState('');
  let available = 0;
  try { available = spendableUsdc(p.balance, p.floor); } catch { /* Invalid form values cannot authorize a sweep. */ }
  return <section className="panel"><h2 className="text-lg font-semibold">24-hour cooldown vault</h2><p className="text-sm text-tertiary">Lock discretionary USDC for 24 hours. The contract preserves a reserve coin covering your registered liquidity floor.</p>
    <p className="text-sm">Balance {formatUsdc(p.balance)} · Floor {formatUsdc(p.floor)} · Available {formatUsdc(available)} USDC</p>
    <label className="block space-y-sm text-sm" htmlFor="lock-amount">Amount to lock (USDC)<input id="lock-amount" className="field" type="number" min="0" max={available} step="0.000001" value={amount} onChange={e => setAmount(Number(e.target.value))}/></label>
    <button className="button w-full" disabled={p.disabled || !p.registered || !Number.isFinite(amount) || amount <= 0 || amount > available} onClick={() => p.onLock(amount)}>Lock USDC for 24 hours</button>
    {!p.registered && <p className="text-xs text-tertiary">Register a profile before locking funds.</p>}
    <div className="space-y-md">{p.vaults.map(v => <div key={v.vaultId} className="border-t border-secondary pt-md space-y-sm"><p className="font-medium text-sm">{formatUsdc(v.amountUsdc)} USDC</p><p className="text-xs text-tertiary">Unlocks {new Date(v.unlockTimeMs).toLocaleString()}</p><button className="button-secondary" disabled={p.disabled || p.now < v.unlockTimeMs} onClick={() => p.onUnlock(v.vaultId)}>{p.now < v.unlockTimeMs ? 'Cooldown active' : 'Unlock matured vault'}</button></div>)}</div>
    <div className="border-t border-secondary pt-lg space-y-md"><label className="block space-y-sm text-sm" htmlFor="reflection">Post-purchase reflection<textarea id="reflection" className="field" value={note} maxLength={8000} rows={3} onChange={e => setNote(e.target.value)} placeholder="What would you like to remember about this purchase?"/></label><button className="button-secondary" disabled={p.memoryDisabled || !note.trim()} onClick={() => p.onReflect(note)}>Remember reflection on Walrus</button></div>
  </section>;
}
