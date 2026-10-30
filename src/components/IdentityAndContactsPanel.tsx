"use client";
import type { OnChainUserProfile } from '@/lib/onchain-user-manager';
export interface FriendInput { handle: string; walletAddress: string; }
interface Props { profile: OnChainUserProfile | null; handle: string; setHandle: (v: string) => void; floor: number; setFloor: (v: number) => void; friends: FriendInput[]; setFriend: (i: number, v: string) => void; disabled: boolean; canSave: boolean; memoryDisabled: boolean; onSave: () => void; onSeed: () => void; }
export function IdentityAndContactsPanel(p: Props) {
  return <section className="panel"><div className="flex flex-wrap items-center justify-between gap-sm"><h2 className="text-lg font-semibold">Identity & contacts</h2><span className="badge">{p.profile?.isRegisteredOnChain ? 'Registered on Sui' : 'Registration required'}</span></div>
    <p className="text-sm text-tertiary">Your wallet owns your profile and contacts on Sui Mainnet. This on-chain information is public.</p>
    <div className="grid gap-md sm:grid-cols-2">
      <label className="space-y-sm text-sm" htmlFor="handle">Handle<input id="handle" className="field" value={p.handle} onChange={e => p.setHandle(e.target.value)} maxLength={64}/></label>
      <label className="space-y-sm text-sm" htmlFor="floor">Liquidity floor (USDC)<input id="floor" className="field" type="number" min="0" step="0.000001" value={p.floor} onChange={e => p.setFloor(Number(e.target.value))}/></label>
    </div>
    <p className="text-xs text-tertiary">Contacts are optional during onboarding. Add real wallets before creating a group bill or storing demo rules.</p>
    <div className="space-y-md">{p.friends.map((f, i) => <label key={f.handle} className="block space-y-sm text-sm" htmlFor={'friend-' + i}>{f.handle} Sui wallet<input id={'friend-' + i} className="field font-mono" placeholder="0x + 64 hex digits" value={f.walletAddress} onChange={e => p.setFriend(i, e.target.value.trim())}/></label>)}</div>
    <button className="button w-full" disabled={p.disabled || !p.canSave} onClick={p.onSave}>Save profile & contacts on Sui</button>
    {!p.canSave && <p className="text-xs text-tertiary">Set up your wallet-owned memory account above before saving your profile.</p>}
    <div className="border-t border-secondary pt-lg space-y-sm"><p className="text-xs text-tertiary">Optional demo: store 12 example preferences in your own Walrus namespaces. These describe demo rules, not verified spending history.</p><button className="button-secondary w-full" disabled={p.memoryDisabled} onClick={p.onSeed}>Store 12 demo rules on Walrus</button></div>
  </section>;
}
