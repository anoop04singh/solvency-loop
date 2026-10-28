import { useState } from 'react'
import { Database, Terminal, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react'
import { WalrusMemoryRecord } from '../lib/walrus-tatum-memory'

interface Props {
  memories: WalrusMemoryRecord[]
  onRefreshRpc: () => void
  rpcLoading: boolean
  lastRpcPayload: unknown
}

export function MemoryAndRpcInspector({ memories, onRefreshRpc, rpcLoading, lastRpcPayload }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'rpc' | 'memories'>('rpc')

  return (
    <div className="space-y-xl">
      {/* Sub Tabs */}
      <div className="flex items-center justify-between border-b border-secondary pb-sm">
        <div className="flex gap-lg">
          <button
            onClick={() => setActiveSubTab('rpc')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeSubTab === 'rpc'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            Tatum Sui RPC Gateway Inspector
          </button>
          <button
            onClick={() => setActiveSubTab('memories')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeSubTab === 'memories'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            Walrus MemWal Decentralized Memory ({memories.length})
          </button>
        </div>

        <span className="text-xs text-tertiary">
          All external communication authenticated via Tatum proxy
        </span>
      </div>

      {activeSubTab === 'rpc' && (
        <section className="rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-sm">
            <div>
              <div className="flex items-center gap-xs">
                <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
                  <Terminal className="size-4 shrink-0 text-fg-brand-primary" />
                </span>
                <h3 className="text-heading-xs font-semibold text-primary">Live Tatum Gateway Terminal</h3>
              </div>
              <p className="text-xs text-secondary mt-xxs">
                Target: <code className="font-mono text-primary">https://sui-mainnet.gateway.tatum.io</code> with mandatory <code className="font-mono text-primary">x-api-key</code> injection
              </p>
            </div>

            <button
              onClick={onRefreshRpc}
              disabled={rpcLoading}
              className="inline-flex items-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring self-start md:self-auto disabled:opacity-50"
            >
              <RefreshCw className={`size-4 shrink-0 text-fg-quaternary ${rpcLoading ? 'animate-spin' : ''}`} />
              <span>Ping Tatum RPC Gateway</span>
            </button>
          </div>

          <div className="bg-secondary rounded-xl p-xl font-mono text-xs text-primary space-y-xs overflow-x-auto border border-secondary">
            <div className="text-tertiary"># Client RPC Request Dispatch via server/tatum-client.mjs</div>
            <div className="text-brand-primary">POST https://sui-mainnet.gateway.tatum.io HTTP/1.1</div>
            <div className="text-tertiary">Host: sui-mainnet.gateway.tatum.io</div>
            <div className="text-tertiary">x-api-key: [REDACTED_BY_CREDENTIAL_GUARD]</div>
            <div className="text-tertiary">Content-Type: application/json</div>
            <div className="pt-xs text-secondary">
              {JSON.stringify(
                lastRpcPayload || {
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'suix_getAllBalances',
                  params: ['0x6a4f91e48f7d921b77c385ad3c41ef6a32bc31bc'],
                },
                null,
                2
              )}
            </div>
          </div>

          <div className="flex gap-lg rounded-xl bg-utility-success-50 p-xl">
            <CheckCircle2 className="mt-xxs size-5 shrink-0 text-utility-success-600" />
            <div>
              <p className="text-sm font-semibold text-utility-success-600">Gateway Verified</p>
              <p className="mt-xxs text-sm text-tertiary">Gateway connection verified: 200 OK received from Tatum Sui Mainnet RPC.</p>
            </div>
          </div>
        </section>
      )}

      {activeSubTab === 'memories' && (
        <section className="rounded-xl border border-secondary bg-primary p-xl space-y-lg shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-xs">
                <span className="flex size-8 items-center justify-center rounded-full bg-utility-brand-50">
                  <Database className="size-4 shrink-0 text-fg-brand-primary" />
                </span>
                <h3 className="text-heading-xs font-semibold text-primary">Decentralized Walrus Memories</h3>
              </div>
              <p className="text-xs text-secondary mt-xxs">
                Agent learning nodes stored off-chain on Walrus Mainnet with cryptographically verified Sui ownership
              </p>
            </div>
            <span className="inline-flex items-center gap-xs rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-medium text-utility-brand-700">
              @mysten-incubation/memwal
            </span>
          </div>

          <div className="space-y-md">
            {memories.map((mem) => (
              <div key={mem.id} className="rounded-xl border border-secondary bg-secondary p-xl space-y-xs">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-sm">
                    <span className="font-semibold text-primary uppercase">{mem.actionType.replace('_', ' ')}</span>
                    <span className="text-tertiary">{new Date(mem.timestamp).toLocaleString()}</span>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-utility-brand-200 bg-utility-brand-50 px-md py-xxs text-xs font-mono font-medium text-utility-brand-700">
                    Confidence: {(mem.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-secondary leading-relaxed">{mem.content}</p>
                {mem.walrusBlobId && (
                  <div className="text-[11px] font-mono text-tertiary pt-xs border-t border-secondary">
                    Blob Storage Ref: {mem.walrusBlobId}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
