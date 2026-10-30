"use client";
import type { OnChainUserProfile } from '@/lib/onchain-user-manager';
export interface FriendInput { handle: string; walletAddress: string; }
interface Props { profile: OnChainUserProfile | null; handle: string; setHandle: (v: string) => void; floor: number; setFloor: (v: number) => void; friends: FriendInput[]; setFriend: (i: number, v: string) => void; disabled: boolean; onSave: () => void; onSeed: () => void; }
export function IdentityAndContactsPanel(p: Props) {
  return <section className="panel"><div className="flex flex-wrap items-center justify-between gap-sm"><h2 className="text-lg font-semibold">Identity & contacts</h2><span className="badge">{p.profile?.isRegisteredOnChain ? 'Registered on Sui' : 'Registration required'}</span></div>
    <p className="text-sm text-tertiary">Your profile and contact graph are owned by your wallet on Sui Mainnet.</p>
    <div className="grid gap-md sm:grid-cols-2">
      <label className="space-y-sm text-sm" htmlFor="handle">Handle<input id="handle" className="field" value={p.handle} onChange={e => p.setHandle(e.target.value)} maxLength={64}/></label>
      <label className="space-y-sm text-sm" htmlFor="floor">Liquidity floor (USDC)<input id="floor" className="field" type="number" min="0" step="0.000001" value={p.floor} onChange={e => p.setFloor(Number(e.target.value))}/></label>
    </div>
    <div className="space-y-md">{p.friends.map((f, i) => <label key={f.handle} className="block space-y-sm text-sm" htmlFor={'friend-' + i}>{f.handle} Sui wallet<input id={'friend-' + i} className="field font-mono" placeholder="0x + 64 hex digits" value={f.walletAddress} onChange={e => p.setFriend(i, e.target.value.trim())}/></label>)}</div>
    <button className="button w-full" disabled={p.disabled} onClick={p.onSave}>Save profile & contacts on Sui</button>
    <div className="border-t border-secondary pt-lg space-y-sm"><p className="text-xs text-tertiary">Optional demo: store 12 example preferences in your own Walrus namespaces. These describe demo rules, not verified spending history.</p><button className="button-secondary w-full" disabled={p.disabled || !p.profile?.isRegisteredOnChain} onClick={p.onSeed}>Store 12 demo rules on Walrus</button></div>
  </section>;
}
