import React, { useEffect, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import {
  fetchFullUserStateViaTatum,
  fetchActiveGroupSplitsViaTatum,
  fetchOwnedCooldownVaultsViaTatum,
  buildRegisterUserAndContactsTx,
  buildCreateGroupSplitTx,
  buildSettleSplitShareTx,
  buildLockInCooldownVaultTx,
  buildUnlockCooldownVaultTx,
  OnChainUserProfile,
  OnChainGroupSplit,
  OnChainCooldownVault,
} from "../lib/onchain-user-manager";
import { IdentityAndContactsPanel } from "../components/IdentityAndContactsPanel";
import {
  SmartSplitEnginePanel,
  ComputedParticipantShare,
} from "../components/SmartSplitEnginePanel";
import { CounterpartySettlementPanel } from "../components/CounterpartySettlementPanel";
import { CooldownVaultPanel } from "../components/CooldownVaultPanel";
import { MemoryAndRpcInspector } from "../components/MemoryAndRpcInspector";

export default function SolvencyLoopDashboard() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [profile, setProfile] = useState<OnChainUserProfile | null>(null);
  const [splits, setSplits] = useState<OnChainGroupSplit[]>([]);
  const [vaults, setVaults] = useState<OnChainCooldownVault[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [rpcLogs, setRpcLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // On-Chain Identity & Friend Wallet States
  const [userHandle, setUserHandle] = useState("anoop.sui");
  const [safeFloorUsdc, setSafeFloorUsdc] = useState(300);
  const [alexWallet, setAlexWallet] = useState(
    process.env.NEXT_PUBLIC_ALEX_SUI_WALLET || "0xa31e42b89f012c478a562ef09823abce8412ff31"
  );
  const [priyaWallet, setPriyaWallet] = useState(
    process.env.NEXT_PUBLIC_PRIYA_SUI_WALLET || "0x8192fb283ac038b77a6411dd220c812bb319803a"
  );
  const [samWallet, setSamWallet] = useState(
    process.env.NEXT_PUBLIC_SAM_SUI_WALLET || "0x55018a38c29191bb990234ac2b011928df77a110"
  );

  // Smart Group Split States
  const [splitTitle, setSplitTitle] = useState("Dinner & Drinks at Social");
  const [foodUsdc, setFoodUsdc] = useState(11.5);
  const [drinksUsdc, setDrinksUsdc] = useState(5.0);
  const [memoryRecallEnabled, setMemoryRecallEnabled] = useState(true);

  const appendLog = (msg: string) =>
    setRpcLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  async function syncAllMainnetState(walletAddr: string) {
    setLoading(true);
    try {
      appendLog(
        `Tatum RPC -> Fetching On-Chain Profile, USDC Balance & Splits for ${walletAddr.slice(
          0,
          8
        )}...`
      );
      const [userState, activeSplits, ownedVaults, memRes] = await Promise.all([
        fetchFullUserStateViaTatum(walletAddr),
        fetchActiveGroupSplitsViaTatum(),
        fetchOwnedCooldownVaultsViaTatum(walletAddr),
        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "recall_all",
            walletAddress: walletAddr,
          }),
        }).then((r) => r.json()),
      ]);

      setProfile(userState);
      setSplits(activeSplits);
      setVaults(ownedVaults);
      setMemories(memRes.memories || []);

      if (userState.isRegisteredOnChain) {
        setUserHandle(userState.handle);
        setSafeFloorUsdc(userState.safeFloorUsdc);
        const a = userState.contacts.find((c) => c.handle === "@alex");
        const p = userState.contacts.find((c) => c.handle === "@priya");
        const s = userState.contacts.find((c) => c.handle === "@sam");
        if (a) setAlexWallet(a.walletAddress);
        if (p) setPriyaWallet(p.walletAddress);
        if (s) setSamWallet(s.walletAddress);
      }

      appendLog(
        `Tatum Checkpoint #${userState.latestCheckpoint} | Recalled ${
          memRes.memories?.length || 0
        } Walrus Mainnet memories.`
      );
    } catch (err: any) {
      appendLog(`Sync Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (account?.address) {
      syncAllMainnetState(account.address);
    }
  }, [account?.address]);

  // Compute Group Split shares dynamically from recalled Walrus Mainnet memories
  const alexExcludedFromDrinks =
    memoryRecallEnabled &&
    memories.some((m) =>
      String(m.text).toLowerCase().includes("never drinks alcohol")
    );
  const samEscrowEnforced =
    memoryRecallEnabled &&
    memories.some((m) =>
      String(m.text).toLowerCase().includes("requires_upfront_escrow=true")
    );

  const totalBill = foodUsdc + drinksUsdc;
  const computedShares: ComputedParticipantShare[] = [
    {
      handle: "@alex",
      ruleApplied: alexExcludedFromDrinks
        ? "Memory #02: Auto-Excluded from Alcohol Tab"
        : "Equal 25% Share",
      walletAddress: alexWallet,
      amountUsdc: alexExcludedFromDrinks
        ? Number((foodUsdc / 4).toFixed(2))
        : Number((totalBill / 4).toFixed(2)),
      requiresUpfrontEscrow: false,
    },
    {
      handle: "@priya",
      ruleApplied: memoryRecallEnabled
        ? "Memory #04: Verified Fast Settler (~15m)"
        : "Equal 25% Share",
      walletAddress: priyaWallet,
      amountUsdc: alexExcludedFromDrinks
        ? Number((foodUsdc / 4 + drinksUsdc / 3).toFixed(2))
        : Number((totalBill / 4).toFixed(2)),
      requiresUpfrontEscrow: false,
    },
    {
      handle: "@sam",
      ruleApplied: samEscrowEnforced
        ? "Memory #05: 14.5d Lag -> Upfront Escrow Enforced"
        : "Equal 25% Share",
      walletAddress: samWallet,
      amountUsdc: alexExcludedFromDrinks
        ? Number((foodUsdc / 4 + drinksUsdc / 3).toFixed(2))
        : Number((totalBill / 4).toFixed(2)),
      requiresUpfrontEscrow: samEscrowEnforced,
    },
  ];

  async function handleRegisterOnChain() {
    if (!account?.address) return;
    setLoading(true);
    try {
      const tx = buildRegisterUserAndContactsTx({
        handle: userHandle,
        memwalAccountId: process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID || "0x0",
        safeFloorUsdc,
        friends: [
          { address: alexWallet, handle: "@alex" },
          { address: priyaWallet, handle: "@priya" },
          { address: samWallet, handle: "@sam" },
        ],
      });
      const res = await signAndExecute({ transaction: tx as any });
      appendLog(`Registered Profile & Contacts on Sui Mainnet! Digest: ${res.digest}`);
      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Register Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed12Memories() {
    if (!account?.address) return;
    setLoading(true);
    try {
      appendLog("Writing 12 Behavioral Liquidity Memories to Walrus Mainnet...");
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "seed_12_mainnet",
          walletAddress: account.address,
          friendWallets: {
            alex: alexWallet,
            priya: priyaWallet,
            sam: samWallet,
          },
        }),
      });
      const data = await res.json();
      appendLog(
        `Committed ${data.count} memories on Walrus Mainnet at Tatum Checkpoint #${data.tatumCheckpoint}`
      );
      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Memory Seed Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeployGroupSplit() {
    if (!account?.address) return;
    setLoading(true);
    try {
      const tx = buildCreateGroupSplitTx({
        title: splitTitle,
        totalAmountUsdc: totalBill,
        shares: computedShares.map((s) => ({
          debtorAddress: s.walletAddress,
          amountUsdc: s.amountUsdc,
          requiresUpfrontEscrow: s.requiresUpfrontEscrow,
        })),
      });
      const res = await signAndExecute({ transaction: tx as any });
      appendLog(`Deployed GroupSplitEscrow on Sui Mainnet! Digest: ${res.digest}`);
      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Split Deploy Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSettleShare(splitId: string, amountUsdc: number) {
    if (!account?.address) return;
    setLoading(true);
    try {
      const tx = await buildSettleSplitShareTx({
        payerAddress: account.address,
        splitObjectId: splitId,
        amountUsdc,
      });
      const res = await signAndExecute({ transaction: tx as any });
      appendLog(`Settled ${amountUsdc} USDC on Sui Mainnet! Digest: ${res.digest}`);

      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remember",
          walletAddress: account.address,
          category: "social_split_trust",
          text: `Counterparty ${account.address} settled ${amountUsdc} USDC on GroupSplitEscrow ${splitId} via Sui Mainnet Tx ${res.digest}.`,
        }),
      });

      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Settlement Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLockCooldown(amountUsdc: number) {
    if (!account?.address) return;
    setLoading(true);
    try {
      const tx = await buildLockInCooldownVaultTx({
        ownerAddress: account.address,
        amountUsdc,
        lockDurationMs: 86_400_000,
        namespace: "habit_regret",
      });
      const res = await signAndExecute({ transaction: tx as any });
      appendLog(`Locked ${amountUsdc} USDC in 24h CooldownVault! Digest: ${res.digest}`);
      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Cooldown Lock Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlockCooldown(vaultId: string) {
    if (!account?.address) return;
    setLoading(true);
    try {
      const tx = buildUnlockCooldownVaultTx({ vaultObjectId: vaultId });
      const res = await signAndExecute({ transaction: tx as any });
      appendLog(`Unlocked CooldownVault ${vaultId}! Digest: ${res.digest}`);
      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Unlock Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogRegretReflection(note: string) {
    if (!account?.address) return;
    setLoading(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remember",
          walletAddress: account.address,
          category: "habit_regret",
          text: note,
        }),
      });
      const data = await res.json();
      appendLog(
        `Committed Regret Reflection to Walrus Mainnet at Tatum Checkpoint #${data.tatumCheckpoint}`
      );
      await syncAllMainnetState(account.address);
    } catch (e: any) {
      appendLog(`Reflection Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-xl max-w-7xl mx-auto space-y-xl bg-primary text-primary font-sans">
      <header className="flex flex-wrap items-center justify-between gap-md border border-secondary bg-primary p-xl rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-solid inline-block shrink-0" />
            <h1 className="text-heading-xs font-bold tracking-tight text-primary">
              SolvencyLoop <span className="text-brand-primary">//</span> Behavioral Liquidity Engine
            </h1>
          </div>
          <p className="text-xs text-secondary mt-xxs">
            100% Zero-DB • Routed via Tatum Sui Mainnet RPC • Powered by Walrus Memory (MemWal)
          </p>
        </div>

        <div className="flex items-center gap-md">
          {profile && (
            <div className="text-right text-xs border-r border-secondary pr-md">
              <div className="text-secondary">
                Tatum Checkpoint:{" "}
                <span className="text-primary font-mono font-medium">
                  #{profile.latestCheckpoint}
                </span>
              </div>
              <div className="font-mono text-sm font-semibold text-utility-success-700">
                {profile.usdcBalance.toFixed(2)} USDC{" "}
                <span className="text-tertiary">|</span>{" "}
                {profile.suiBalance.toFixed(3)} SUI
              </div>
            </div>
          )}
          <ConnectButton />
        </div>
      </header>

      {!account ? (
        <div className="flex gap-lg rounded-xl bg-utility-brand-50 p-2xl">
          <div>
            <p className="text-sm font-semibold text-utility-brand-700">
              Connect a Real Sui Mainnet Wallet to Launch SolvencyLoop
            </p>
            <p className="mt-xs text-xs text-secondary max-w-xl">
              All user profiles, contact graphs, group splits, and behavioral habits
              are read and written directly to Sui Mainnet and Walrus Mainnet via
              Tatum&apos;s RPC Gateway.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
            <div className="lg:col-span-5">
              <IdentityAndContactsPanel
                userHandle={userHandle}
                setUserHandle={setUserHandle}
                safeFloorUsdc={safeFloorUsdc}
                setSafeFloorUsdc={setSafeFloorUsdc}
                alexWallet={alexWallet}
                setAlexWallet={setAlexWallet}
                priyaWallet={priyaWallet}
                setPriyaWallet={setPriyaWallet}
                samWallet={samWallet}
                setSamWallet={setSamWallet}
                isRegisteredOnChain={Boolean(profile?.isRegisteredOnChain)}
                loading={loading}
                onRegisterOnChain={handleRegisterOnChain}
                onSeed12Memories={handleSeed12Memories}
              />
            </div>

            <div className="lg:col-span-7">
              <SmartSplitEnginePanel
                splitTitle={splitTitle}
                setSplitTitle={setSplitTitle}
                foodUsdc={foodUsdc}
                setFoodUsdc={setFoodUsdc}
                drinksUsdc={drinksUsdc}
                setDrinksUsdc={setDrinksUsdc}
                escrowThresholdUsdc={40}
                memoryRecallEnabled={memoryRecallEnabled}
                setMemoryRecallEnabled={setMemoryRecallEnabled}
                shares={computedShares}
                loading={loading}
                onDeployGroupSplit={handleDeployGroupSplit}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
            <CounterpartySettlementPanel
              connectedWallet={account.address}
              splits={splits}
              loading={loading}
              onSettleShare={handleSettleShare}
            />

            <CooldownVaultPanel
              usdcBalance={profile?.usdcBalance || 0}
              safeFloorUsdc={safeFloorUsdc}
              vaults={vaults}
              loading={loading}
              onLockCooldown={handleLockCooldown}
              onUnlockCooldown={handleUnlockCooldown}
              onLogRegretReflection={handleLogRegretReflection}
            />
          </div>

          <MemoryAndRpcInspector memories={memories} rpcLogs={rpcLogs} />
        </>
      )}
    </main>
  );
}
