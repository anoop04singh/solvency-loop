import React from "react";
import { OnChainGroupSplit } from "../lib/onchain-user-manager";

interface Props {
  connectedWallet: string;
  splits: OnChainGroupSplit[];
  loading: boolean;
  onSettleShare: (splitId: string, amountUsdc: number) => void;
}

export function CounterpartySettlementPanel({
  connectedWallet,
  splits,
  loading,
  onSettleShare,
}: Props) {
  return (
    <section className="rounded-xl border border-secondary bg-primary p-xl space-y-md shadow-xs">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
          3. Multi-Wallet Counterparty Settlement Desk
        </h2>
        <p className="text-xs text-secondary mt-xxs">
          Switch to @alex, @priya, or @sam in your Sui wallet extension to settle live Mainnet shares
        </p>
      </div>

      {splits.length === 0 ? (
        <div className="flex gap-lg rounded-xl bg-utility-gray-50 p-xl">
          <div>
            <p className="text-sm font-semibold text-utility-gray-700">No Active Splits</p>
            <p className="mt-xxs text-sm text-tertiary">No GroupSplitEscrow objects deployed yet. Create a split above to inspect live on-chain obligations.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-sm">
          {splits.map((split) => (
            <div
              key={split.splitId}
              className="border border-secondary bg-secondary p-md rounded-lg space-y-sm text-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-primary">{split.title}</span>
                  <span className="ml-2 font-mono text-xs text-tertiary">
                    Object: {split.splitId.slice(0, 10)}...
                  </span>
                </div>
                <span className="font-mono text-primary font-medium">
                  Total: {split.totalBillUsdc.toFixed(2)} USDC
                </span>
              </div>

              <div className="space-y-xs">
                {split.participants.map((p, i) => {
                  const isConnectedDebtor =
                    p.debtor.toLowerCase() === connectedWallet.toLowerCase();

                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-primary px-md py-sm rounded border border-secondary"
                    >
                      <div className="font-mono text-xs">
                        <span className="text-primary">
                          {p.debtor.slice(0, 8)}...{p.debtor.slice(-6)}
                        </span>
                        {isConnectedDebtor && (
                          <span className="ml-2 px-sm py-xxs rounded bg-utility-brand-50 text-utility-brand-700 border border-utility-brand-200">
                            CONNECTED WALLET
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-md">
                        <span className="font-mono font-semibold text-primary">
                          {p.amountOwedUsdc.toFixed(2)} USDC
                        </span>
                        {p.isSettled ? (
                          <span className="px-sm py-xxs rounded-full bg-utility-success-50 text-utility-success-700 border border-utility-success-200 font-mono text-xs">
                            SETTLED ON-CHAIN
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              onSettleShare(split.splitId, p.amountOwedUsdc)
                            }
                            disabled={loading || !isConnectedDebtor}
                            className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-md py-xs text-xs font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                          >
                            {isConnectedDebtor
                              ? "Settle Share with USDC"
                              : "Switch to Debtor Wallet"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
