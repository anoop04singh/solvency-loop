"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSignPersonalMessage } from '@mysten/dapp-kit';
import type { Transaction } from '@mysten/sui/transactions';
import { errorMessage, publicConfig } from '@/lib/config';
import { buildCreateMemWalAccountTx, buildMemWalDelegateTx, fetchWalletMemWalAccount, type WalletMemWalAccount } from '@/lib/memwal-account';
import { formatUsdc } from '@/lib/money';
import { computeSplit } from '@/lib/split-rules';
import { requestMemory } from '@/lib/memory-api';
import { tatumSuiClient } from '@/lib/tatum-rpc-client';
import type { MemoryPayload, RecalledMemory, SettlementCursor } from '@/lib/memory-protocol';
import {
  fetchFullUserStateViaTatum, fetchActiveGroupSplitsViaTatum, fetchOwnedCooldownVaultsViaTatum,
  buildRegisterUserAndContactsTx, buildCreateGroupSplitTx, buildSettleSplitShareTx, buildSplitActionTx,
  buildLockInCooldownVaultTx, buildUnlockCooldownVaultTx, confirmTransaction,
  type OnChainUserProfile, type OnChainGroupSplit, type OnChainCooldownVault,
} from '@/lib/onchain-user-manager';
import { IdentityAndContactsPanel, type FriendInput } from '@/components/IdentityAndContactsPanel';
import { MemWalAccountPanel } from '@/components/MemWalAccountPanel';
import { SmartSplitEnginePanel } from '@/components/SmartSplitEnginePanel';
import { CounterpartySettlementPanel } from '@/components/CounterpartySettlementPanel';
import { CooldownVaultPanel } from '@/components/CooldownVaultPanel';
import { MemoryAndRpcInspector } from '@/components/MemoryAndRpcInspector';

function initialFriends(): FriendInput[] {
  return [
    { handle: '@alex', walletAddress: process.env.NEXT_PUBLIC_ALEX_SUI_WALLET || '' },
    { handle: '@priya', walletAddress: process.env.NEXT_PUBLIC_PRIYA_SUI_WALLET || '' },
    { handle: '@sam', walletAddress: process.env.NEXT_PUBLIC_SAM_SUI_WALLET || '' },
  ];
}
export default function SolvencyLoopDashboard() {
  const account = useCurrentAccount(), wallet = account?.address || '';
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const [setup, setSetup] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [profile, setProfile] = useState<OnChainUserProfile | null>(null);
  const [memoryAccount, setMemoryAccount] = useState<WalletMemWalAccount | null>(null), [memoryAccountLoaded, setMemoryAccountLoaded] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<SettlementCursor | null>(null), [historyStarted, setHistoryStarted] = useState(false);
  const [splits, setSplits] = useState<OnChainGroupSplit[]>([]), [vaults, setVaults] = useState<OnChainCooldownVault[]>([]);
  const [memories, setMemories] = useState<RecalledMemory[]>([]), [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pendingLearning, setPendingLearning] = useState('');
  const [handle, setHandle] = useState(''), [floor, setFloor] = useState(300), [friends, setFriends] = useState(initialFriends);
  const [title, setTitle] = useState('Dinner & drinks'), [food, setFood] = useState(11.5), [drinks, setDrinks] = useState(5), [enabled, setEnabled] = useState(true);
  const [now, setNow] = useState(0);
  const generation = useRef(0), activeWallet = useRef(wallet), operation = useRef(false);
  const hasMemoryAccess = !!profile?.isRegisteredOnChain && !!memoryAccount?.active && memoryAccount.delegateAuthorized && profile.memwalAccountId === memoryAccount.accountId;
  activeWallet.current = wallet;
  const append = useCallback((message: string) => setLogs(old => [new Date().toLocaleTimeString() + ' · ' + message, ...old].slice(0, 100)), []);
  useEffect(() => {
    fetch('/api/config').then(async r => { if (!r.ok) throw new Error('Setup status unavailable.'); setSetup(await r.json()); }).catch(e => setError(errorMessage(e)));
    setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer);
  }, []);
  const sync = useCallback(async (address: string) => {
    const version = generation.current;
    const [user, groupSplits, ownedVaults, ownedMemory] = await Promise.all([fetchFullUserStateViaTatum(address), fetchActiveGroupSplitsViaTatum(address), fetchOwnedCooldownVaultsViaTatum(address), fetchWalletMemWalAccount(address)]);
    if (version !== generation.current || address !== activeWallet.current) return;
    setProfile(user); setSplits(groupSplits); setVaults(ownedVaults);
    setMemoryAccount(ownedMemory); setMemoryAccountLoaded(true);
    if (!ownedMemory?.active || !ownedMemory.delegateAuthorized || user.memwalAccountId !== ownedMemory.accountId) setMemories([]);
    if (user.isRegisteredOnChain) {
      setHandle(user.handle); setFloor(user.safeFloorUsdc);
      setFriends(initialFriends().map(f => ({ ...f, walletAddress: user.contacts.find(c => c.handle === f.handle)?.walletAddress || '' })));
    }
    append('Confirmed Sui state at Tatum checkpoint #' + user.latestCheckpoint);
  }, [append]);
  useEffect(() => {
    generation.current++;
    setMemoryAccount(null); setMemoryAccountLoaded(false); setHistoryCursor(null); setHistoryStarted(false);
    setProfile(null); setSplits([]); setVaults([]); setMemories([]); setFriends(initialFriends()); setHandle(''); setFloor(300); setLogs([]); setError(''); setNotice(''); setPendingLearning('');
    if (!wallet || !setup?.configured) return;
    let current = true;
    setBusy(true);
    sync(wallet).catch(e => { if (current) setError(errorMessage(e)); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [wallet, setup?.configured, sync]);
  const run = async (work: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { const message = errorMessage(e); setError(message); append(message); }
    finally { operation.current = false; setBusy(false); }
  };
  const memory = async (payload: Omit<MemoryPayload, 'walletAddress'>) => {
    const address = wallet;
    const result = await requestMemory({ ...payload, walletAddress: address }, signMessage);
    if (address !== activeWallet.current) return result;
    if (result.memories) setMemories(result.memories);
    append('Walrus ' + payload.action + ' confirmed at Tatum checkpoint #' + result.tatumAnchor?.checkpoint);
    return result;
  };
  const transact = async (transaction: Transaction | Promise<Transaction>, learn = false) => {
    const address = wallet;
    const tx = await transaction;
    tx.setSenderIfNotSet(address);
    await tx.build({ client: tatumSuiClient });
    if (address !== activeWallet.current) throw new Error('Wallet changed; review the action again.');
    const response = await signAndExecute({ transaction: tx, chain: 'sui:mainnet' });
    await confirmTransaction(response.digest);
    if (address !== activeWallet.current) return;
    append('Confirmed Sui transaction ' + response.digest);
    setNotice('Transaction confirmed: ' + response.digest);
    if (learn) setPendingLearning(response.digest);
    await sync(address);
    if (address !== activeWallet.current) return;
    if (learn) {
      if (!hasMemoryAccess) { setNotice('Transaction confirmed: ' + response.digest + '. Complete your memory account setup, then use the memory retry button or import your settlement history.'); return; }
      try { await memory({ action: 'settlement', digest: response.digest }); if (address === activeWallet.current) setPendingLearning(''); }
      catch (e) { if (address === activeWallet.current) { setPendingLearning(response.digest); setError('Payment is confirmed. Memory update failed: ' + errorMessage(e) + '. You can retry the memory update below.'); } }
    }
  };
  let computed = { shares: [] as ReturnType<typeof computeSplit>['shares'], total: 0, creatorShare: 0 }, splitError = '';
  try { if (wallet) computed = computeSplit(wallet, friends, food, drinks, memories, enabled); } catch (e) { splitError = errorMessage(e); }
  const mainnet = !!account?.chains.includes('sui:mainnet'), disabled = busy || !setup?.configured || !mainnet;
  const memoryDisabled = disabled || !hasMemoryAccess;

  return <main className="min-h-screen max-w-7xl mx-auto p-xl lg:p-4xl space-y-3xl">
    <header className="flex flex-wrap items-center justify-between gap-lg border-b border-secondary pb-xl">
      <div><p className="text-sm font-medium text-brand-primary">Sui Mainnet · Walrus memory</p><h1 className="text-heading-sm font-semibold">SolvencyLoop</h1><p className="text-sm text-tertiary mt-xs">Shared expenses, personal liquidity, and decisions you can learn from.</p></div>
      <div className="flex flex-wrap items-center gap-md"><button className="button-secondary" disabled={disabled || !wallet} onClick={() => run(() => sync(wallet))}>Refresh state</button><ConnectButton/></div>
    </header>
    {!setup ? <p className="text-sm text-tertiary" role="status">Checking application configuration…</p>
      : !setup.configured && <div className="rounded-xl bg-utility-warning-50 p-xl space-y-sm" role="status"><h2 className="font-semibold text-utility-warning-700">Mainnet setup required</h2><p className="text-sm">The application is ready to configure. Deploy the contract and fill in your local environment before using wallet actions.</p><p className="text-xs font-mono break-words">Missing: {setup.missing.join(', ')}</p><p className="text-xs text-tertiary">See README.md for deployment and credential setup.</p></div>}
    {error && <div className="rounded-xl bg-utility-error-50 p-xl text-sm text-utility-error-700 break-words" role="alert">{error}</div>}
    {pendingLearning && <button className="button-secondary" disabled={memoryDisabled} onClick={() => run(async () => { await memory({ action: 'settlement', digest: pendingLearning }); setPendingLearning(''); setNotice('Settlement learning committed to Walrus.'); })}>Retry memory update for confirmed payment</button>}
    {notice && <div className="rounded-xl bg-utility-success-50 p-xl text-sm text-utility-success-700 break-words" role="status">{notice}</div>}
    {busy && <p className="text-sm text-tertiary" role="status">Working… Approve any requested wallet signature, then wait for confirmation.</p>}
    {!account ? <section className="panel"><h2 className="text-lg font-semibold">Connect your Sui wallet</h2><p className="text-sm text-tertiary">Connect to manage your profile, create USDC splits, and view your cooldown vaults. All persistent financial state lives on Sui; behavioral memories live on Walrus.</p></section> : <>
      {!mainnet && <p className="text-sm text-error-primary" role="alert">Choose a wallet account that supports Sui Mainnet.</p>}
      <div className="flex flex-wrap justify-between gap-lg text-sm"><p className="font-mono break-all">Wallet: {wallet}</p><p>{profile ? formatUsdc(profile.usdcBalance) + ' USDC · ' + profile.suiBalance.toFixed(4) + ' SUI · Checkpoint #' + profile.latestCheckpoint : 'No on-chain state loaded'}</p></div>
      <MemWalAccountPanel account={memoryAccount} loaded={memoryAccountLoaded} profileAccountId={profile?.memwalAccountId} delegatePublicKey={publicConfig().memwalDelegatePublicKey} disabled={disabled}
        onCreate={() => run(() => transact(buildCreateMemWalAccountTx(wallet)))}
        onAuthorize={() => run(() => transact(buildMemWalDelegateTx(wallet, 'authorize')))}
        onRevoke={() => run(async () => { try { await transact(buildMemWalDelegateTx(wallet, 'revoke')); } finally { setMemories([]); } })}/>
      <div className="grid gap-xl lg:grid-cols-2">
        <IdentityAndContactsPanel profile={profile} handle={handle} setHandle={setHandle} floor={floor} setFloor={setFloor} friends={friends} setFriend={(i, value) => setFriends(old => old.map((f, n) => n === i ? { ...f, walletAddress: value } : f))} disabled={disabled} canSave={memoryAccountLoaded && !!memoryAccount} memoryDisabled={memoryDisabled}
          onSave={() => run(async () => { const owned = await fetchWalletMemWalAccount(wallet); if (!owned) throw new Error('Create your memory account first.'); await transact(buildRegisterUserAndContactsTx({ walletAddress: wallet, handle, safeFloorUsdc: floor, memwalAccountId: owned.accountId, friends: friends.map(f => ({ address: f.walletAddress, handle: f.handle })), existingContacts: profile?.contacts })); })}
          onSeed={() => run(async () => { const result = await memory({ action: 'seed_12_mainnet', friendWallets: { alex: friends[0].walletAddress, priya: friends[1].walletAddress, sam: friends[2].walletAddress } }); setNotice(result.count + ' demo memories committed to Walrus. Recall them to apply their rules.'); })}/>
        <SmartSplitEnginePanel title={title} setTitle={setTitle} food={food} setFood={setFood} drinks={drinks} setDrinks={setDrinks} enabled={enabled} setEnabled={setEnabled} {...computed} error={splitError} memoryCount={memories.length} disabled={disabled}
          onCreate={() => run(() => transact(buildCreateGroupSplitTx({ walletAddress: wallet, title, totalAmountUsdc: computed.total, shares: computed.shares.map(s => ({ debtorAddress: s.walletAddress, amountUsdc: s.amountUsdc, requiresUpfrontEscrow: s.requiresUpfrontEscrow })) })))}/>
        <CounterpartySettlementPanel wallet={wallet} splits={splits} now={now} disabled={disabled}
          onPay={(split, amount, upfront) => run(() => transact(buildSettleSplitShareTx({ payerAddress: wallet, splitObjectId: split.splitId, amountUsdc: amount, upfront }), !upfront))}
          onAction={(id, action) => run(() => transact(buildSplitActionTx(id, action), action === 'activate_group_split'))}/>
        <CooldownVaultPanel balance={profile?.usdcBalance || 0} floor={profile?.safeFloorUsdc ?? floor} registered={!!profile?.isRegisteredOnChain} vaults={vaults} now={now} disabled={disabled} memoryDisabled={memoryDisabled}
          onLock={amount => run(() => transact(buildLockInCooldownVaultTx({ ownerAddress: wallet, amountUsdc: amount })))}
          onUnlock={id => run(() => transact(buildUnlockCooldownVaultTx({ vaultObjectId: id })))}
          onReflect={text => run(async () => { await memory({ action: 'remember', category: 'habit_regret', text }); setNotice('Reflection committed to Walrus.'); })}/>
      </div>
      <MemoryAndRpcInspector memories={memories} logs={logs} disabled={memoryDisabled} historyStarted={historyStarted} historyHasMore={!!historyCursor}
        onImportSettlements={() => run(async () => { const address = wallet; const result = await memory({ action: 'sync_settlements', ...(historyCursor ? { cursor: historyCursor } : {}) }); if (address !== activeWallet.current) return; setHistoryStarted(true); setHistoryCursor(result.nextCursor || null); setNotice(result.count + ' verified settlement observations committed to your account.' + (result.nextCursor ? ' Continue with the next history page.' : ' History scan complete.')); })}
        onRecall={() => run(async () => { await memory({ action: 'recall_all' }); })}
        onAnalyze={(text, category) => run(async () => { await memory({ action: 'analyze', text, category }); setNotice('Extracted facts committed to Walrus. Recall to inspect them.'); })}
        onRestore={category => run(async () => { const r = await memory({ action: 'restore', category }); setNotice(r.result?.truncated ? 'More memories remain. Restore again to continue recovery.' : 'Category restore completed. Recall to inspect its memories.'); })}/>
    </>}
  </main>;
}
