import React from "react";

interface Props {
  userHandle: string;
  setUserHandle: (v: string) => void;
  safeFloorUsdc: number;
  setSafeFloorUsdc: (v: number) => void;
  alexWallet: string;
  setAlexWallet: (v: string) => void;
  priyaWallet: string;
  setPriyaWallet: (v: string) => void;
  samWallet: string;
  setSamWallet: (v: string) => void;
  isRegisteredOnChain: boolean;
  loading: boolean;
  onRegisterOnChain: () => void;
  onSeed12Memories: () => void;
}

export function IdentityAndContactsPanel({
  userHandle,
  setUserHandle,
  safeFloorUsdc,
  setSafeFloorUsdc,
  alexWallet,
  setAlexWallet,
  priyaWallet,
  setPriyaWallet,
  samWallet,
  setSamWallet,
  isRegisteredOnChain,
  loading,
  onRegisterOnChain,
  onSeed12Memories,
}: Props) {
  return (
    <section className="rounded-xl border border-secondary bg-primary p-xl space-y-md shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            1. On-Chain Identity & Social Graph
          </h2>
          <p className="text-xs text-secondary mt-xxs">
            Stored in Sui Mainnet Move Dynamic Fields (Zero Off-Chain DB)
          </p>
        </div>
        <span
          className={`text-xs px-md py-xxs rounded-full font-mono border ${
            isRegisteredOnChain
              ? "bg-utility-success-50 text-utility-success-700 border-utility-success-200"
              : "bg-utility-warning-50 text-utility-warning-700 border-utility-warning-200"
          }`}
        >
          {isRegisteredOnChain ? "ON-CHAIN VERIFIED" : "UNREGISTERED WALLET"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-md text-xs">
        <div className="flex flex-col gap-sm">
          <label className="text-sm font-medium text-secondary">Your On-Chain Handle</label>
          <input
            value={userHandle}
            onChange={(e) => setUserHandle(e.target.value)}
            className="w-full rounded-md bg-primary px-lg py-sm font-mono text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <div className="flex flex-col gap-sm">
          <label className="text-sm font-medium text-secondary">
            Hard Liquidity Floor (USDC)
          </label>
          <input
            type="number"
            value={safeFloorUsdc}
            onChange={(e) => setSafeFloorUsdc(Number(e.target.value))}
            className="w-full rounded-md bg-primary px-lg py-sm font-mono text-primary border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
      </div>

      <div className="space-y-sm text-xs">
        <div className="flex flex-col gap-xs">
          <label className="text-sm font-medium text-secondary">
            @alex Real Sui Mainnet Wallet Address
          </label>
          <input
            value={alexWallet}
            onChange={(e) => setAlexWallet(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md bg-primary px-lg py-sm font-mono text-xs text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-sm font-medium text-secondary">
            @priya Real Sui Mainnet Wallet Address
          </label>
          <input
            value={priyaWallet}
            onChange={(e) => setPriyaWallet(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md bg-primary px-lg py-sm font-mono text-xs text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-sm font-medium text-secondary">
            @sam Real Sui Mainnet Wallet Address
          </label>
          <input
            value={samWallet}
            onChange={(e) => setSamWallet(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md bg-primary px-lg py-sm font-mono text-xs text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-sm pt-sm border-t border-secondary">
        <button
          onClick={onRegisterOnChain}
          disabled={loading}
          className="inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm text-sm font-semibold text-secondary border border-primary shadow-xs hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
        >
          Sync Profile & Friend Wallets to Sui Mainnet (via Tatum RPC)
        </button>
        <button
          onClick={onSeed12Memories}
          disabled={loading}
          className="inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
        >
          Commit 12 Behavioral Memories to Walrus Mainnet (MemWal)
        </button>
      </div>
    </section>
  );
}
