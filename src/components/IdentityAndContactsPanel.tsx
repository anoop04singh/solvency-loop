import { useState } from 'react'
import { UserCheck, UserPlus, Shield, Copy, Check, ExternalLink } from 'lucide-react'
import { OnChainUserProfile } from '../lib/onchain-user-manager'

interface Props {
  userProfile: OnChainUserProfile
  contacts: Array<{
    name: string
    address: string
    trustScore: number
    owedBalanceUsdc: number
    role: string
  }>
  onAddContact: (address: string, name: string) => void
}

export function IdentityAndContactsPanel({ userProfile, contacts, onAddContact }: Props) {
  const [newContactAddress, setNewContactAddress] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContactAddress || !newContactName) return
    onAddContact(newContactAddress, newContactName)
    setNewContactAddress('')
    setNewContactName('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
      {/* User On-Chain Identity Profile */}
      <section className="lg:col-span-1 rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
              <UserCheck className="size-4 shrink-0 text-fg-brand-primary" />
            </span>
            <h3 className="text-heading-xs font-semibold text-primary">On-Chain Identity</h3>
          </div>
          <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
            Sui Move Object
          </span>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          Stored directly in the <code className="font-mono text-primary">SolvencyRegistry</code> dynamic field. Zero off-chain databases.
        </p>

        <div className="space-y-md">
          <div className="flex flex-col gap-sm">
            <label className="text-sm font-medium text-secondary">Handle & Namespace</label>
            <div className="rounded-md bg-disabled-subtle px-lg py-sm text-sm font-mono text-disabled border border-secondary flex items-center justify-between">
              <span>{userProfile.handle}</span>
              <span className="inline-flex items-center gap-xs rounded-full border border-utility-success-200 bg-utility-success-50 px-md py-xxs text-xs font-medium text-utility-success-700">
                Verified
              </span>
            </div>
            <p className="text-xs text-tertiary">Registered on Sui Mainnet</p>
          </div>

          <div className="flex flex-col gap-sm">
            <label className="text-sm font-medium text-secondary">Mainnet Address</label>
            <div className="flex items-center gap-xs">
              <input
                type="text"
                readOnly
                disabled
                value={userProfile.owner}
                className="w-full rounded-md bg-disabled-subtle px-lg py-sm text-xs font-mono text-disabled border border-secondary cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => handleCopy(userProfile.owner)}
                className="inline-flex items-center justify-center rounded-lg bg-primary p-sm text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring shrink-0"
                title="Copy Address"
              >
                {copied ? <Check className="size-4 shrink-0 text-fg-success-primary" /> : <Copy className="size-4 shrink-0 text-fg-quaternary" />}
              </button>
            </div>
          </div>

          <div className="pt-sm border-t border-secondary space-y-sm text-xs">
            <div className="flex justify-between items-center">
              <span className="text-tertiary">Trust Rating</span>
              <span className="font-semibold text-utility-success-700">{userProfile.trustScore} / 100</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-tertiary">Registered Epoch</span>
              <span className="font-mono text-secondary">Epoch {userProfile.createdAtEpoch}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-tertiary">Total Volume Settled</span>
              <span className="font-mono font-medium text-primary">${userProfile.totalSettledVolume.toFixed(2)} USDC</span>
            </div>
          </div>
        </div>
      </section>

      {/* Verified Social Graph */}
      <section className="lg:col-span-2 rounded-xl border border-secondary bg-primary p-xl shadow-xs space-y-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-sm">
          <div>
            <div className="flex items-center gap-xs">
              <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
                <Shield className="size-4 shrink-0 text-fg-brand-primary" />
              </span>
              <h3 className="text-heading-xs font-semibold text-primary">Verified Social Graph</h3>
            </div>
            <p className="text-xs text-secondary mt-xxs">
              Sui Mainnet peer addresses authenticated for instant settlements and bill splitting
            </p>
          </div>
          <span className="inline-flex items-center gap-xs rounded-full border border-utility-gray-200 bg-utility-gray-50 px-md py-xxs text-xs font-medium text-utility-gray-700 self-start md:self-auto">
            {contacts.length} Contacts Linked
          </span>
        </div>

        {/* Table according to recipe: rounded-xl, overflow-hidden, sticky thead bg-secondary */}
        <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="border-b border-secondary text-left">
                <th className="px-3xl py-md text-sm font-semibold text-quaternary">Peer & Sui Address</th>
                <th className="px-3xl py-md text-sm font-semibold text-quaternary text-center">Trust & Standing</th>
                <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Net Balance</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.address} className="border-b border-secondary hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-focus-ring">
                  <td className="px-3xl py-md text-md text-tertiary">
                    <div className="flex items-center gap-sm">
                      <span className="text-primary font-medium">{c.name}</span>
                      <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-sm py-xxs text-xs font-medium text-utility-brand-700">
                        {c.role}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-tertiary mt-xxs">{c.address}</div>
                  </td>
                  <td className="px-3xl py-md text-center">
                    <span className="text-xs font-semibold text-primary">{c.trustScore}/100</span>
                    <div className="text-xs text-utility-success-700">Reliable</div>
                  </td>
                  <td className="px-3xl py-md text-right font-mono text-xs">
                    {c.owedBalanceUsdc > 0 ? (
                      <span className="font-semibold text-warning-primary">
                        +{c.owedBalanceUsdc.toFixed(2)} USDC
                      </span>
                    ) : c.owedBalanceUsdc < 0 ? (
                      <span className="font-semibold text-error-primary">
                        {c.owedBalanceUsdc.toFixed(2)} USDC
                      </span>
                    ) : (
                      <span className="text-tertiary">0.00 USDC</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add new peer form */}
        <form onSubmit={handleAdd} className="rounded-xl border border-secondary bg-secondary p-xl space-y-md">
          <div className="flex items-center gap-xs text-xs font-semibold text-primary">
            <UserPlus className="size-4 shrink-0 text-fg-brand-primary" />
            <span>Add New Peer to Sui On-Chain Graph</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-medium text-secondary">Contact Name</label>
              <input
                type="text"
                placeholder="e.g. Elena Core Dev"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-medium text-secondary">Sui Mainnet Address</label>
              <input
                type="text"
                placeholder="0x... Sui Address"
                value={newContactAddress}
                onChange={(e) => setNewContactAddress(e.target.value)}
                className="rounded-md bg-primary px-lg py-sm text-xs font-mono text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
          >
            Append Peer to Dynamic Field Object (Move Call)
          </button>
        </form>
      </section>
    </div>
  )
}
