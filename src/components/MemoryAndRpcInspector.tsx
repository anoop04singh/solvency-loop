import React from "react";

interface Props {
  memories: any[];
  rpcLogs: string[];
}

export function MemoryAndRpcInspector({ memories, rpcLogs }: Props) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
      <div className="rounded-xl border border-secondary bg-primary p-xl space-y-md shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary">
            Recalled Walrus Mainnet Memories ({memories.length})
          </h3>
          <span className="text-xs font-mono text-brand-primary">
            @mysten-incubation/memwal
          </span>
        </div>
        <div className="space-y-sm max-h-64 overflow-y-auto text-xs font-mono">
          {memories.length === 0 ? (
            <div className="flex gap-lg rounded-xl bg-utility-gray-50 p-xl">
              <div>
                <p className="text-sm font-semibold text-utility-gray-700">No Memories Recalled</p>
                <p className="mt-xxs text-sm text-tertiary">Click &quot;Commit 12 Behavioral Memories&quot; to populate your Mainnet namespace.</p>
              </div>
            </div>
          ) : (
            memories.map((m, idx) => (
              <div
                key={idx}
                className="p-md rounded bg-secondary border border-secondary space-y-xs"
              >
                <div className="flex items-center justify-between text-xs text-tertiary">
                  <span>Namespace: {m.namespace || "default"}</span>
                  {typeof m.distance === "number" && (
                    <span>Distance: {m.distance.toFixed(3)}</span>
                  )}
                </div>
                <div className="text-primary">{m.text}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-secondary bg-primary p-xl space-y-md shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary">
            Tatum Sui Mainnet RPC & MemWal Execution Stream
          </h3>
          <span className="text-xs font-mono text-utility-success-700">
            sui-mainnet.gateway.tatum.io
          </span>
        </div>
        <div className="space-y-xs max-h-64 overflow-y-auto text-xs font-mono text-secondary">
          {rpcLogs.map((entry, idx) => (
            <div key={idx} className="border-b border-secondary pb-xs">
              {entry}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
