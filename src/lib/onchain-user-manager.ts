import { Transaction } from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import { tatumSuiClient } from './tatum-rpc-client';
import { contractConfig, requireAddress, SUI_MAINNET_USDC_TYPE } from './config';
import { positiveUsdc, usdcToUnits, unitsToUsdc } from './money';
import { fetchWalletMemWalAccount } from './memwal-account';
import { onboardingStatus } from './onboarding';

export interface OnChainContact { walletAddress: string; handle: string; }
export interface OnChainUserProfile {
  profileId: string; wallet: string; handle: string; memwalAccountId: string; safeFloorUsdc: number; contacts: OnChainContact[];
  usdcBalance: number; suiBalance: number; latestCheckpoint: string; isRegisteredOnChain: boolean;
}
export interface OnChainGroupSplit {
  splitId: string; creator: string; title: string; totalBillUsdc: number; creatorShareUsdc: number;
  createdAtMs: number; fundingDeadlineMs: number; isActive: boolean; isCancelled: boolean; pendingUpfront: number;
  participants: { debtor: string; amountOwedUsdc: number; requiresUpfrontEscrow: boolean; isFunded: boolean; isSettled: boolean; settledAtMs: number; }[];
}
export interface OnChainCooldownVault { vaultId: string; amountUsdc: number; unlockTimeMs: number; namespace: string; }
type Fields = Record<string, unknown>;
function record(value: unknown): Fields {
  if (!value || typeof value !== 'object') throw new Error('Unexpected on-chain object content.');
  const r = value as Fields;
  return r.fields && typeof r.fields === 'object' ? r.fields as Fields : r;
}
function entries(value: unknown): Fields[] {
  const contents = record(value).contents;
  if (!Array.isArray(contents)) throw new Error('Unexpected on-chain VecMap.');
  return contents.map(record);
}
function amount(value: unknown): number {
  if (value && typeof value === 'object') return unitsToUsdc(String(record(value).value));
  return unitsToUsdc(String(value));
}
export async function fetchOwnedUserProfileViaTatum(walletAddress: string) {
  const wallet = requireAddress(walletAddress), { packageId, registryId } = contractConfig();
  const registry = await tatumSuiClient.getObject({ id: registryId, options: { showContent: true, showOwner: true } });
  if (registry.error || registry.data?.content?.dataType !== 'moveObject' || registry.data.content.type !== packageId + '::core::SolvencyRegistry' || !registry.data.owner || typeof registry.data.owner !== 'object' || !('Shared' in registry.data.owner)) throw new Error('Configured shared SolvencyRegistry could not be verified.');
  const entry = await tatumSuiClient.getDynamicFieldObject({ parentId: registryId, name: { type: 'address', value: wallet } });
  if (entry.error?.code === 'dynamicFieldNotFound') return null;
  if (entry.error || entry.data?.content?.dataType !== 'moveObject') throw new Error('Profile directory read failed. Registration is disabled until the directory can be read.');
  const directory = record(entry.data.content.fields);
  if (normalizeStructTag(entry.data.content.type) !== normalizeStructTag('0x2::dynamic_field::Field<address, 0x2::object::ID>') || requireAddress(directory.name, 'Profile directory wallet') !== wallet) throw new Error('Profile directory format mismatch. Deploy the current object-factory contract.');
  const profileId = requireAddress(directory.value, 'Registered profile ID');
  const obj = await tatumSuiClient.getObject({ id: profileId, options: { showContent: true, showOwner: true } });
  if (obj.error || obj.data?.objectId !== profileId || obj.data.content?.dataType !== 'moveObject' || obj.data.content.type !== packageId + '::core::UserProfile') throw new Error('Registered UserProfile object could not be verified.');
  const owner = obj.data.owner;
  if (!owner || typeof owner !== 'object' || !('AddressOwner' in owner) || requireAddress(owner.AddressOwner, 'Profile owner') !== wallet) throw new Error('Registered UserProfile is not owned by the connected wallet.');
  const p = record(obj.data.content.fields);
  if (requireAddress(record(p.id).id, 'Profile UID') !== profileId || requireAddress(p.wallet, 'Profile wallet') !== wallet || typeof p.handle !== 'string') throw new Error('Registered profile identity does not match its directory entry.');
  return { profileId, wallet, handle: p.handle, memwalAccountId: requireAddress(p.memwal_account_id, 'Profile MemWal account'), safeFloorUsdc: amount(p.safe_floor_usdc),
    contacts: entries(p.contacts).map(e => ({ walletAddress: requireAddress(e.key, 'Contact wallet'), handle: String(e.value) })) };
}
export async function fetchFullUserStateViaTatum(walletAddress: string): Promise<OnChainUserProfile> {
  const wallet = requireAddress(walletAddress);
  const [balances, checkpoint, profile] = await Promise.all([
    tatumSuiClient.getAllBalances({ owner: wallet }), tatumSuiClient.getLatestCheckpointSequenceNumber(), fetchOwnedUserProfileViaTatum(wallet),
  ]);
  const base = { wallet, usdcBalance: unitsToUsdc(balances.find(b => b.coinType === SUI_MAINNET_USDC_TYPE)?.totalBalance || '0'),
    suiBalance: Number(balances.find(b => b.coinType.endsWith('::sui::SUI'))?.totalBalance || '0') / 1e9, latestCheckpoint: checkpoint };
  if (!profile) return { ...base, profileId: '', handle: '', memwalAccountId: '', safeFloorUsdc: 300, contacts: [], isRegisteredOnChain: false };
  return { ...base, ...profile, isRegisteredOnChain: true };
}
export async function fetchActiveGroupSplitsViaTatum(walletAddress: string): Promise<OnChainGroupSplit[]> {
  const wallet = requireAddress(walletAddress);
  const { packageId } = contractConfig();
  const ids = new Set<string>();
  let cursor: { txDigest: string; eventSeq: string } | null = null;
  do {
    const page = await tatumSuiClient.queryEvents({ query: { MoveEventType: packageId + '::core::SplitCreatedEvent' }, limit: 50, order: 'descending', cursor });
    for (const e of page.data) { const id = (e.parsedJson as Fields | undefined)?.split_id; if (typeof id === 'string') ids.add(id); }
    if (!page.hasNextPage) break;
    if (!page.nextCursor || JSON.stringify(page.nextCursor) === JSON.stringify(cursor)) throw new Error('Split pagination did not advance.');
    cursor = page.nextCursor;
  } while (true);
  const result: OnChainGroupSplit[] = [];
  const all = [...ids];
  for (let i = 0; i < all.length; i += 50) {
    const objects = await tatumSuiClient.multiGetObjects({ ids: all.slice(i, i + 50), options: { showContent: true } });
    for (const obj of objects) {
      if (obj.error) throw new Error('Split read failed: ' + obj.error.code);
      if (obj.data?.content?.dataType !== 'moveObject') throw new Error('Split content unavailable.');
      const f = record(obj.data.content.fields);
      const participants = entries(f.participants).map(p => {
        const v = record(p.value);
        return { debtor: String(v.debtor), amountOwedUsdc: amount(v.amount_owed), requiresUpfrontEscrow: v.requires_upfront_escrow === true,
          isFunded: v.is_funded === true, isSettled: v.is_settled === true, settledAtMs: Number(v.settled_at_ms) };
      });
      if (f.creator !== wallet && !participants.some(p => p.debtor === wallet)) continue;
      result.push({ splitId: obj.data.objectId, creator: String(f.creator), title: String(f.title), totalBillUsdc: amount(f.total_bill_amount),
        creatorShareUsdc: amount(f.creator_share), createdAtMs: Number(f.created_at_ms), fundingDeadlineMs: Number(f.funding_deadline_ms),
        isActive: f.is_active === true, isCancelled: f.is_cancelled === true, pendingUpfront: Number(f.pending_upfront), participants });
    }
  }
  return result;
}
export async function fetchOwnedCooldownVaultsViaTatum(walletAddress: string): Promise<OnChainCooldownVault[]> {
  const wallet = requireAddress(walletAddress), { packageId } = contractConfig();
  const result: OnChainCooldownVault[] = [];
  let cursor: string | null = null;
  do {
    const page = await tatumSuiClient.getOwnedObjects({ owner: wallet, filter: { StructType: packageId + '::core::CooldownVault<' + SUI_MAINNET_USDC_TYPE + '>' }, options: { showContent: true }, cursor });
    for (const obj of page.data) {
      if (obj.error || obj.data?.content?.dataType !== 'moveObject') throw new Error('Vault content unavailable.');
      const f = record(obj.data.content.fields);
      result.push({ vaultId: obj.data.objectId, amountUsdc: amount(f.locked_balance), unlockTimeMs: Number(f.unlock_time_ms), namespace: String(f.trigger_memory_namespace) });
    }
    if (!page.hasNextPage) break;
    if (!page.nextCursor || page.nextCursor === cursor) throw new Error('Vault pagination did not advance.');
    cursor = page.nextCursor;
  } while (true);
  return result;
}
async function transactionAccess(walletAddress: string, recovery = false) {
  const wallet = requireAddress(walletAddress);
  const [profile, memory] = await Promise.all([fetchFullUserStateViaTatum(wallet), fetchWalletMemWalAccount(wallet)]);
  const status = onboardingStatus(profile, memory);
  if (!(recovery ? status.canRecover : status.ready)) throw new Error('A wallet-owned MemWal account, linked on-chain profile, and active app authorization are required before using the application.');
  return { profile, accountId: memory!.accountId, ...contractConfig() };
}
export async function buildRegisterUserAndContactsTx(p: { walletAddress: string; handle: string; memwalAccountId: string; safeFloorUsdc: number; friends: { address: string; handle: string }[]; }) {
  const { packageId, registryId } = contractConfig(), wallet = requireAddress(p.walletAddress);
  if (!p.handle.trim() || new TextEncoder().encode(p.handle).length > 64) throw new Error('Handle must contain 1–64 bytes.');
  const addresses = p.friends.map(f => requireAddress(f.address, f.handle));
  if (new Set([wallet, ...addresses]).size !== addresses.length + 1) throw new Error('Friends must have distinct wallets different from yours.');
  for (const f of p.friends) if (!f.handle.trim() || new TextEncoder().encode(f.handle.trim()).length > 64) throw new Error('Contact labels must contain 1–64 bytes.');
  const [memory, profile] = await Promise.all([fetchWalletMemWalAccount(wallet), fetchOwnedUserProfileViaTatum(wallet)]);
  if (!memory?.active || !memory.delegateAuthorized || memory.accountId !== requireAddress(p.memwalAccountId)) throw new Error('Create your wallet-owned MemWal account and authorize the app before saving your profile.');
  const tx = new Transaction(); tx.setSender(wallet);
  if (!profile) {
    tx.moveCall({ target: packageId + '::core::register_user', arguments: [tx.object(registryId), tx.pure.string(p.handle.trim()), tx.object(memory.accountId), tx.pure.u64(usdcToUnits(p.safeFloorUsdc)), tx.pure.vector('address', addresses), tx.pure.vector('string', p.friends.map(f => f.handle.trim())), tx.object('0x6')] });
  } else {
    tx.moveCall({ target: packageId + '::core::update_profile', arguments: [tx.object(profile.profileId), tx.pure.string(p.handle.trim()), tx.object(memory.accountId), tx.pure.u64(usdcToUnits(p.safeFloorUsdc))] });
    for (const old of profile.contacts) if (!addresses.includes(old.walletAddress)) tx.moveCall({ target: packageId + '::core::remove_contact', arguments: [tx.object(profile.profileId), tx.object(memory.accountId), tx.pure.address(old.walletAddress)] });
    for (const f of p.friends) tx.moveCall({ target: packageId + '::core::add_contact', arguments: [tx.object(profile.profileId), tx.object(memory.accountId), tx.pure.address(f.address), tx.pure.string(f.handle.trim())] });
  }
  return tx;
}
export async function buildCreateGroupSplitTx(p: { walletAddress: string; title: string; totalAmountUsdc: number; shares: { debtorAddress: string; amountUsdc: number; requiresUpfrontEscrow: boolean }[]; }) {
  const { packageId } = contractConfig(), wallet = requireAddress(p.walletAddress), total = positiveUsdc(p.totalAmountUsdc);
  const addresses = p.shares.map(s => requireAddress(s.debtorAddress)), amounts = p.shares.map(s => positiveUsdc(s.amountUsdc));
  if (!p.title.trim() || new TextEncoder().encode(p.title).length > 120) throw new Error('Split title must contain 1–120 bytes.');
  if (!addresses.length || new Set([wallet, ...addresses]).size !== addresses.length + 1) throw new Error('Split wallets must be distinct.');
  if (amounts.reduce((a, b) => a + b, 0n) >= total) throw new Error('The creator must retain a positive share of the total.');
  const access = await transactionAccess(wallet);
  const tx = new Transaction(); tx.setSender(wallet);
  tx.moveCall({ target: packageId + '::core::create_group_split', typeArguments: [SUI_MAINNET_USDC_TYPE], arguments: [tx.object(access.profile.profileId), tx.object(access.accountId), tx.pure.string(p.title.trim()), tx.pure.u64(total), tx.pure.vector('address', addresses), tx.pure.vector('u64', amounts), tx.pure.vector('bool', p.shares.map(s => s.requiresUpfrontEscrow)), tx.object('0x6')] });
  return tx;
}
async function paymentCoins(owner: string, required: bigint, tx: Transaction) {
  requireAddress(owner);
  const chosen: string[] = []; let total = 0n, cursor: string | null = null;
  do {
    const page = await tatumSuiClient.getCoins({ owner, coinType: SUI_MAINNET_USDC_TYPE, cursor, limit: 100 });
    for (const c of page.data) { chosen.push(c.coinObjectId); total += BigInt(c.balance); if (total >= required) break; }
    if (total >= required || !page.hasNextPage) break;
    if (!page.nextCursor || page.nextCursor === cursor) throw new Error('Coin pagination did not advance.');
    cursor = page.nextCursor;
  } while (true);
  if (total < required) throw new Error('Insufficient Circle USDC; the amount and any liquidity reserve must both be available.');
  const primary = tx.object(chosen[0]);
  for (let i = 1; i < chosen.length; i += 100) tx.mergeCoins(primary, chosen.slice(i, i + 100).map(id => tx.object(id)));
  return primary;
}
export async function buildSettleSplitShareTx(p: { payerAddress: string; splitObjectId: string; amountUsdc: number; upfront?: boolean; }) {
  const { packageId } = contractConfig(), units = positiveUsdc(p.amountUsdc);
  const tx = new Transaction(); tx.setSender(requireAddress(p.payerAddress));
  const access = await transactionAccess(p.payerAddress);
  const coin = await paymentCoins(p.payerAddress, units, tx), [payment] = tx.splitCoins(coin, [tx.pure.u64(units)]);
  tx.moveCall({ target: packageId + '::core::' + (p.upfront ? 'fund_split_share' : 'settle_split_share'), typeArguments: [SUI_MAINNET_USDC_TYPE], arguments: [tx.object(access.profile.profileId), tx.object(access.accountId), tx.object(requireAddress(p.splitObjectId, 'Split ID')), payment, tx.object('0x6')] });
  return tx;
}
export async function buildSplitActionTx(walletAddress: string, splitId: string, action: 'activate_group_split' | 'cancel_group_split' | 'refund_escrow') {
  const { packageId, profile, accountId } = await transactionAccess(walletAddress, action !== 'activate_group_split'), tx = new Transaction();
  tx.setSender(requireAddress(walletAddress));
  const args = [tx.object(profile.profileId), tx.object(accountId), tx.object(requireAddress(splitId))];
  if (action !== 'cancel_group_split') args.push(tx.object('0x6'));
  tx.moveCall({ target: packageId + '::core::' + action, typeArguments: [SUI_MAINNET_USDC_TYPE], arguments: args }); return tx;
}
export async function buildLockInCooldownVaultTx(p: { ownerAddress: string; amountUsdc: number; }) {
  const { packageId } = contractConfig(), units = positiveUsdc(p.amountUsdc);
  const { profile, accountId } = await transactionAccess(p.ownerAddress);
  const tx = new Transaction(); tx.setSender(requireAddress(p.ownerAddress));
  const reserve = await paymentCoins(p.ownerAddress, units + usdcToUnits(profile.safeFloorUsdc), tx);
  const [funds] = tx.splitCoins(reserve, [tx.pure.u64(units)]);
  tx.moveCall({ target: packageId + '::core::lock_in_cooldown_vault', typeArguments: [SUI_MAINNET_USDC_TYPE], arguments: [tx.object(profile.profileId), tx.object(accountId), funds, reserve, tx.pure.string('habit_regret'), tx.object('0x6')] });
  return tx;
}
export async function buildUnlockCooldownVaultTx(p: { ownerAddress: string; vaultObjectId: string }) {
  const { packageId, profile, accountId } = await transactionAccess(p.ownerAddress, true), tx = new Transaction();
  tx.setSender(requireAddress(p.ownerAddress));
  tx.moveCall({ target: packageId + '::core::unlock_cooldown_vault', typeArguments: [SUI_MAINNET_USDC_TYPE], arguments: [tx.object(profile.profileId), tx.object(accountId), tx.object(requireAddress(p.vaultObjectId)), tx.object('0x6')] }); return tx;
}
export async function confirmTransaction(digest: string) {
  const result = await tatumSuiClient.waitForTransaction({ digest, options: { showEffects: true, showEvents: true } });
  if (result.effects?.status.status !== 'success') throw new Error(result.effects?.status.error || 'Transaction failed on chain.');
  return result;
}
