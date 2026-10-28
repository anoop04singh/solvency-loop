import { useState } from 'react'
import { Lock, Unlock, Clock, AlertTriangle, ShieldCheck } from 'lucide-react'

interface Props {
  lockedBalance: number
  lockDurationHours: number
  onDeposit: (amount: number, reason: string) => void
  onWithdraw: () => void
}

export function CooldownVaultPanel({ lockedBalance, lockDurationHours, onDeposit, onWithdraw }: Props) {
  const [depositAmount, setDepositAmount] = useState<number | ''>('')
  const [reason, setReason] = useState('')
  const [vaultMsg, setVaultMsg] = useState<string | null>(null)

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!depositAmount || Number(depositAmount) <= 0) return
    onDeposit(Number(depositAmount), reason || 'Impulse financial protection')
    setVaultMsg(`Successfully deposited $${Number(depositAmount).toFixed(2)} USDC into Cooldown Vault!`)
    setDepositAmount('')
    setReason('')
    setTimeout(() => setVaultMsg(null), 4000)
  }

  const handleWithdrawClick = () => {
    onWithdraw()
    setVaultMsg('Withdrawal processed from Cooldown Vault to wallet via Tatum RPC.')
    setTimeout(() => setVaultMsg(null), 4000)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
      <section className="lg:col-span-2 rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
              <Lock className="size-4 shrink-0 text-fg-brand-primary" />
            </span>
            <h3 className="text-heading-xs font-semibold text-primary">Impulse Cooldown Vault</h3>
          </div>
          <span className="inline-flex items-center gap-xs rounded-full border border-utility-warning-200 bg-utility-warning-50 px-md py-xxs text-xs font-medium text-utility-warning-700">
            <Clock className="size-3.5 shrink-0 text-fg-warning-primary" />
            Locked (Time Lock Active)
          </span>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          Enforces self-imposed cooldown periods on volatile expenditures. Once deposited into the Sui Move vault, funds remain unwithdrawable until the designated timestamp expires.
        </p>

        {vaultMsg && (
          <div className="flex gap-lg rounded-xl bg-utility-success-50 p-xl">
            <ShieldCheck className="mt-xxs size-5 shrink-0 text-utility-success-600" />
            <div>
              <p className="text-sm font-semibold text-utility-success-600">Vault Updated</p>
              <p className="mt-xxs text-sm text-tertiary">{vaultMsg}</p>
            </div>
          </div>
        )}

        {/* Vault Status Box */}
        <div className="rounded-xl border border-secondary bg-secondary p-xl space-y-md">
          <div className="flex justify-between items-center">
            <span className="text-sm text-tertiary">Current Timelocked Reserve</span>
            <span className="font-mono text-heading-xs font-bold text-primary">${lockedBalance.toFixed(2)} USDC</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-tertiary">Cooldown Period Remaining</span>
            <span className="font-mono text-xs font-semibold text-utility-warning-700">{lockDurationHours} Hours (Epoch 520)</span>
          </div>
          {/* Progress bar recipe: track bg-tertiary, fill bg-brand-solid, both rounded-full */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-tertiary">
            <div className="h-full w-2/3 rounded-full bg-brand-solid"></div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleWithdrawClick}
              disabled={lockedBalance <= 0}
              className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
            >
              <Unlock className="size-4 shrink-0 text-fg-quaternary" />
              <span>Withdraw to Sui Wallet</span>
            </button>
          </div>
        </div>

        {/* Form to Deposit */}
        <form onSubmit={handleDepositSubmit} className="space-y-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-medium text-secondary">Deposit Amount (Circle USDC)</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="250.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="rounded-md bg-primary px-lg py-sm text-sm font-mono text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-medium text-secondary">Protection Reason / Goal</label>
              <input
                type="text"
                placeholder="e.g. Prevent impulse token trades"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
          >
            Deposit & Lock into Sui Move Cooldown Vault
          </button>
        </form>
      </section>

      {/* Safety Guard & Walrus Insight */}
      <section className="lg:col-span-1 rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
        <h3 className="text-heading-xs font-semibold text-primary">On-Chain Invariants</h3>
        <ul className="space-y-sm text-xs text-secondary leading-relaxed">
          <li className="flex items-start gap-xs">
            <AlertTriangle className="size-4 text-fg-warning-primary shrink-0 mt-0.5" />
            <span>Strict Move contract verification: Funds cannot be prematurely released by UI or admin keys.</span>
          </li>
          <li className="flex items-start gap-xs">
            <AlertTriangle className="size-4 text-fg-warning-primary shrink-0 mt-0.5" />
            <span>Emergency early unlocking requires 2-of-3 threshold consensus from verified social graph peers.</span>
          </li>
          <li className="flex items-start gap-xs">
            <AlertTriangle className="size-4 text-fg-warning-primary shrink-0 mt-0.5" />
            <span>All deposit events persist on Walrus storage for long-term behavioral memory tracking.</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
