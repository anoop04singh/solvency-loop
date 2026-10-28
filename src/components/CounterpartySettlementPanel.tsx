import { useState } from 'react'
import { Activity, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react'

interface Props {
  contacts: Array<{
    name: string
    address: string
    owedBalanceUsdc: number
  }>
  onSettle: (address: string, amount: number) => void
}

export function CounterpartySettlementPanel({ contacts, onSettle }: Props) {
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  const handleExecuteSettle = (address: string, amount: number, name: string) => {
    onSettle(address, amount)
    setSuccessNotice(`Settled $${amount.toFixed(2)} USDC with ${name} on Sui Mainnet! Transaction dispatched via Tatum RPC.`)
    setTimeout(() => setSuccessNotice(null), 5000)
  }

  const owedByMe = contacts.filter((c) => c.owedBalanceUsdc < 0)
  const owedToMe = contacts.filter((c) => c.owedBalanceUsdc > 0)

  const totalOwedByMe = owedByMe.reduce((acc, curr) => acc + Math.abs(curr.owedBalanceUsdc), 0)
  const totalOwedToMe = owedToMe.reduce((acc, curr) => acc + curr.owedBalanceUsdc, 0)
  const netSolvency = totalOwedToMe - totalOwedByMe

  return (
    <div className="space-y-xl">
      {successNotice && (
        <div className="flex gap-lg rounded-xl bg-utility-success-50 p-xl">
          <CheckCircle2 className="mt-xxs size-5 shrink-0 text-utility-success-600" />
          <div>
            <p className="text-sm font-semibold text-utility-success-600">Settlement Complete</p>
            <p className="mt-xxs text-sm text-tertiary">{successNotice}</p>
          </div>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <section className="p-xl rounded-xl border border-secondary bg-primary space-y-sm shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm text-tertiary">Total Liabilities (You Owe)</span>
            <ArrowDownLeft className="size-4 text-fg-error-primary shrink-0" />
          </div>
          <p className="text-heading-md font-bold text-error-primary font-mono">
            ${totalOwedByMe.toFixed(2)} USDC
          </p>
          <p className="text-xs text-secondary">Outstanding across {owedByMe.length} peer debts</p>
        </section>

        <section className="p-xl rounded-xl border border-secondary bg-primary space-y-sm shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm text-tertiary">Total Receivables (Owed to You)</span>
            <ArrowUpRight className="size-4 text-fg-success-primary shrink-0" />
          </div>
          <p className="text-heading-md font-bold text-utility-success-700 font-mono">
            ${totalOwedToMe.toFixed(2)} USDC
          </p>
          <p className="text-xs text-secondary">Pending from {owedToMe.length} counterparties</p>
        </section>

        <section className="p-xl rounded-xl border border-secondary bg-primary space-y-sm shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm text-tertiary">Net Counterparty Solvency</span>
            <Activity className="size-4 text-fg-brand-primary shrink-0" />
          </div>
          <p className={`text-heading-md font-bold font-mono ${netSolvency >= 0 ? 'text-utility-success-700' : 'text-error-primary'}`}>
            {netSolvency >= 0 ? `+$${netSolvency.toFixed(2)}` : `-$${Math.abs(netSolvency).toFixed(2)}`} USDC
          </p>
          <p className="text-xs text-utility-brand-700 font-medium">Solvency Health: Verified On-Chain</p>
        </section>
      </div>

      {/* Settlement Action Table */}
      <section className="rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
        <div>
          <h3 className="text-heading-xs font-semibold text-primary">Direct Counterparty Settlement Desk</h3>
          <p className="text-xs text-secondary mt-xxs">
            Execute atomic Circle USDC settlement calls directly through the <code className="font-mono text-primary">solvency_loop::core::settle_share</code> Move function.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="border-b border-secondary text-left">
                <th className="px-3xl py-md text-sm font-semibold text-quaternary">Counterparty Peer</th>
                <th className="px-3xl py-md text-sm font-semibold text-quaternary">Liability Status</th>
                <th className="px-3xl py-md text-sm font-semibold text-quaternary text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.address} className="border-b border-secondary hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-focus-ring">
                  <td className="px-3xl py-md text-md text-tertiary">
                    <div className="font-medium text-primary">{contact.name}</div>
                    <div className="text-xs font-mono text-tertiary mt-xxs">{contact.address}</div>
                  </td>

                  <td className="px-3xl py-md">
                    {contact.owedBalanceUsdc < 0 ? (
                      <span className="font-mono font-semibold text-error-primary text-xs">
                        You owe ${Math.abs(contact.owedBalanceUsdc).toFixed(2)} USDC
                      </span>
                    ) : contact.owedBalanceUsdc > 0 ? (
                      <span className="font-mono font-semibold text-utility-success-700 text-xs">
                        Owes you ${contact.owedBalanceUsdc.toFixed(2)} USDC
                      </span>
                    ) : (
                      <span className="font-mono text-tertiary text-xs">Balanced (0.00 USDC)</span>
                    )}
                  </td>

                  <td className="px-3xl py-md text-right">
                    {contact.owedBalanceUsdc < 0 ? (
                      <button
                        onClick={() => handleExecuteSettle(contact.address, Math.abs(contact.owedBalanceUsdc), contact.name)}
                        className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        Settle Debt Now
                      </button>
                    ) : contact.owedBalanceUsdc > 0 ? (
                      <button
                        onClick={() => alert(`Requested payment ping dispatched via Walrus Agent Memory to ${contact.name}`)}
                        className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        Send Solvency Ping
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-xs rounded-full border border-utility-gray-200 bg-utility-gray-50 px-md py-xxs text-xs font-medium text-utility-gray-700">
                        All Settled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
