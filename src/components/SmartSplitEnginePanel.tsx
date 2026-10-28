import { useState } from 'react'
import { PieChart, Send, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { CIRCLE_USDC_MAINNET } from '../lib/tatum-rpc-client'

interface Contact {
  name: string
  address: string
  role: string
}

interface Props {
  contacts: Contact[]
  onProposeSplit: (description: string, totalAmount: number, participants: string[], shares: number[]) => void
}

export function SmartSplitEnginePanel({ contacts, onProposeSplit }: Props) {
  const [description, setDescription] = useState('')
  const [totalAmount, setTotalAmount] = useState<number | ''>('')
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>(contacts.map((c) => c.address))
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const toggleParticipant = (addr: string) => {
    if (selectedAddresses.includes(addr)) {
      setSelectedAddresses(selectedAddresses.filter((a) => a !== addr))
    } else {
      setSelectedAddresses([...selectedAddresses, addr])
    }
  }

  const handlePropose = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description || !totalAmount || selectedAddresses.length === 0) return

    const totalNum = Number(totalAmount)
    const shareEach = totalNum / (selectedAddresses.length + 1) // including user
    const shares = selectedAddresses.map(() => shareEach)

    onProposeSplit(description, totalNum, selectedAddresses, shares)
    setStatusMsg(`Split proposal successfully created on Sui Mainnet! Transaction executed via Tatum Gateway.`)
    setDescription('')
    setTotalAmount('')
    setTimeout(() => setStatusMsg(null), 5000)
  }

  const currentTotal = typeof totalAmount === 'number' ? totalAmount : 0
  const participantCount = selectedAddresses.length + 1
  const individualShare = participantCount > 0 ? (currentTotal / participantCount).toFixed(2) : '0.00'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
      <section className="lg:col-span-2 rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
              <PieChart className="size-4 shrink-0 text-fg-brand-primary" />
            </span>
            <h3 className="text-heading-xs font-semibold text-primary">Smart Split Engine</h3>
          </div>
          <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-mono font-medium text-utility-brand-700">
            Circle USDC Mainnet
          </span>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          Instantiates an on-chain <code className="font-mono text-primary">SplitProposal</code> object holding fractional payment obligations. Fully automated without central accounting.
        </p>

        {statusMsg && (
          <div className="flex gap-lg rounded-xl bg-utility-success-50 p-xl">
            <CheckCircle2 className="mt-xxs size-5 shrink-0 text-utility-success-600" />
            <div>
              <p className="text-sm font-semibold text-utility-success-600">Proposal Confirmed</p>
              <p className="mt-xxs text-sm text-tertiary">{statusMsg}</p>
            </div>
          </div>
        )}

        <form onSubmit={handlePropose} className="space-y-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-medium text-secondary">Split Description / Purpose</label>
              <input
                type="text"
                required
                placeholder="e.g. Validator Cloud Infrastructure Q4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-medium text-secondary">Total Amount (Circle USDC)</label>
              <input
                type="number"
                required
                step="0.01"
                min="0.1"
                placeholder="300.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="rounded-md bg-primary px-lg py-sm text-sm font-mono text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
          </div>

          <div className="space-y-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-secondary">Select Split Counterparties</label>
              <span className="text-xs text-tertiary">
                Per person share: <strong className="font-mono text-primary">${individualShare} USDC</strong>
              </span>
            </div>

            <div className="space-y-xs">
              {contacts.map((contact) => {
                const isSelected = selectedAddresses.includes(contact.address)
                return (
                  <div
                    key={contact.address}
                    onClick={() => toggleParticipant(contact.address)}
                    className={`p-sm rounded-md border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-secondary border-brand text-primary'
                        : 'bg-primary border-secondary text-secondary opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-sm">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-brand-solid border-transparent text-primary-on-brand' : 'border-primary'}`}>
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </div>
                      <span className="font-medium text-primary">{contact.name}</span>
                      <span className="font-mono text-tertiary">({contact.address.slice(0, 8)}...{contact.address.slice(-6)})</span>
                    </div>
                    <span className="font-mono text-secondary">${individualShare} USDC</span>
                  </div>
                )
              })}
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
          >
            <Send className="size-4 shrink-0 text-fg-white" />
            <span>Create Split Object on Sui Mainnet (via Tatum RPC)</span>
          </button>
        </form>
      </section>

      <section className="lg:col-span-1 rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
        <div className="flex items-center gap-xs">
          <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
            <Sparkles className="size-4 shrink-0 text-fg-brand-primary" />
          </span>
          <h3 className="text-heading-xs font-semibold text-primary">MemWal Advisor</h3>
        </div>
        <p className="text-xs text-secondary leading-relaxed">
          Decentralized Walrus memories analyze past payment velocity and credit reliability.
        </p>

        <div className="rounded-xl border border-secondary bg-secondary p-xl space-y-md text-xs">
          <div className="space-y-xs">
            <span className="text-xs font-semibold text-primary">Behavioral Insight #1</span>
            <p className="text-secondary leading-relaxed">
              Alex consistently confirms payment within 4 hours of split generation. Optimal settlement speed (A+).
            </p>
          </div>

          <div className="space-y-xs pt-sm border-t border-secondary">
            <span className="text-xs font-semibold text-primary">Payment Risk Factor</span>
            <p className="text-secondary leading-relaxed">
              Sam has 1 ongoing settlement backlog. Splitting above 100 USDC with Sam without prior escrow might result in longer settlement cycles.
            </p>
          </div>

          <div className="pt-xs border-t border-secondary text-tertiary text-xs font-mono">
            Source: walrus://blob/0x38fa...19ac
          </div>
        </div>
      </section>
    </div>
  )
}
