import React, { useState } from "react";
import { OnChainCooldownVault } from "../lib/onchain-user-manager";

interface Props {
  usdcBalance: number;
  safeFloorUsdc: number;
  vaults: OnChainCooldownVault[];
  loading: boolean;
  onLockCooldown: (amountUsdc: number) => void;
  onUnlockCooldown: (vaultId: string) => void;
  onLogRegretReflection: (note: string) => void;
}

export function CooldownVaultPanel({
  usdcBalance,
  safeFloorUsdc,
  vaults,
  loading,
  onLockCooldown,
  onUnlockCooldown,
  onLogRegretReflection,
}: Props) {
  const [sweepAmount, setSweepAmount] = useState(
    Math.max(1, Number((usdcBalance - safeFloorUsdc).toFixed(2)))
  );
  const [reflectionNote, setReflectionNote] = useState(
    "Regretted $38 weekday 11:45 PM food delivery order (92% regret score); activate 24h CooldownVault shield."
  );

  return (
    <section className="rounded-xl border border-secondary bg-primary p-xl space-y-md shadow-xs">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
          4. 48-Hour Regret Pulse & 24h Cooldown Vault
        </h2>
        <p className="text-xs text-secondary mt-xxs">
          Encodes post-purchase regret via MemWal & locks vulnerable idle USDC in CooldownVault&lt;USDC&gt;
        </p>
      </div>

      <div className="space-y-sm text-xs">
        <label className="text-sm font-medium text-secondary block">
          Log 48-Hour Post-Purchase Regret Reflection to Walrus Mainnet
        </label>
        <div className="flex gap-sm">
          <input
            value={reflectionNote}
            onChange={(e) => setReflectionNote(e.target.value)}
            className="flex-1 rounded-md bg-primary px-lg py-sm text-xs text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          <button
            onClick={() => onLogRegretReflection(reflectionNote)}
            disabled={loading}
            className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-xs font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 whitespace-nowrap"
          >
            Remember Regret
          </button>
        </div>
      </div>

      <div className="border-t border-secondary pt-md flex items-end gap-md text-xs">
        <div className="flex-1">
          <label className="text-sm font-medium text-secondary block mb-xs">
            Sweep Idle USDC Above Floor ({safeFloorUsdc} USDC) into On-Chain CooldownVault
          </label>
          <input
            type="number"
            step="0.5"
            value={sweepAmount}
            onChange={(e) => setSweepAmount(Number(e.target.value))}
            className="w-full rounded-md bg-primary px-lg py-sm text-sm font-mono text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <button
          onClick={() => onLockCooldown(sweepAmount)}
          disabled={loading}
          className="inline-flex items-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 whitespace-nowrap"
        >
          Lock in 24h CooldownVault
        </button>
      </div>

      {vaults.length > 0 && (
        <div className="space-y-sm pt-sm text-xs">
          <div className="text-secondary font-semibold">Active Cooldown Vaults:</div>
          {vaults.map((v) => (
            <div
              key={v.vaultId}
              className="flex items-center justify-between bg-secondary border border-secondary p-md rounded-lg"
            >
              <div className="font-mono text-xs">
                <span className="text-utility-success-700 font-bold">
                  {v.amountUsdc.toFixed(2)} USDC
                </span>{" "}
                <span className="text-tertiary">
                  | Unlocks: {new Date(v.unlockTimeMs).toLocaleTimeString()}
                </span>
              </div>
              <button
                onClick={() => onUnlockCooldown(v.vaultId)}
                disabled={loading}
                className="px-md py-xs rounded bg-primary border border-secondary text-primary font-mono text-xs hover:bg-secondary transition-colors"
              >
                Unlock Vault
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
