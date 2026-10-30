import { Transaction } from '@mysten/sui/transactions';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { fromHex, toHex } from '@mysten/sui/utils';
import { memwalConfig, requireAddress } from './config';
import { tatumSuiClient } from './tatum-rpc-client';

export interface WalletMemWalAccount {
  accountId: string; owner: string; active: boolean; delegateAuthorized: boolean; delegateCount: number;
}
type AccountReader = Pick<typeof tatumSuiClient, 'getObject' | 'getDynamicFieldObject'>;
type Fields = Record<string, unknown>;
function fields(value: unknown): Fields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed MemWal on-chain data.');
  const r = value as Fields;
  return r.fields && typeof r.fields === 'object' ? r.fields as Fields : r;
}
function shared(owner: unknown) { return !!owner && typeof owner === 'object' && 'Shared' in owner; }

// Read the registry's owner -> ID table, rather than scanning events or accepting a browser-supplied ID.
export async function fetchWalletMemWalAccount(walletAddress: string, client: AccountReader = tatumSuiClient): Promise<WalletMemWalAccount | null> {
  const wallet = requireAddress(walletAddress), config = memwalConfig();
  const registry = await client.getObject({ id: config.registryId, options: { showContent: true, showOwner: true } });
  if (registry.error || registry.data?.content?.dataType !== 'moveObject' || registry.data.content.type !== config.packageId + '::account::AccountRegistry' || !shared(registry.data.owner)) throw new Error('Configured shared MemWal AccountRegistry could not be verified.');
  const table = fields(fields(registry.data.content.fields).accounts);
  const tableId = requireAddress(fields(table.id).id, 'MemWal accounts table');
  const entry = await client.getDynamicFieldObject({ parentId: tableId, name: { type: 'address', value: wallet } });
  if (entry.error?.code === 'dynamicFieldNotFound') return null;
  if (entry.error || entry.data?.content?.dataType !== 'moveObject') throw new Error('MemWal account lookup failed; account creation is disabled until the registry can be read.');
  const accountId = requireAddress(fields(entry.data.content.fields).value, 'Registered MemWal account');
  const object = await client.getObject({ id: accountId, options: { showContent: true, showOwner: true } });
  if (object.error || object.data?.content?.dataType !== 'moveObject' || object.data.content.type !== config.packageId + '::account::MemWalAccount' || !shared(object.data.owner)) throw new Error('Registered MemWal account object could not be verified.');
  const account = fields(object.data.content.fields);
  if (requireAddress(account.owner, 'MemWal owner') !== wallet) throw new Error('MemWal account is not owned by the connected wallet.');
  if (typeof account.active !== 'boolean' || !Array.isArray(account.delegate_keys)) throw new Error('Malformed MemWal account permissions.');
  const expectedAddress = new Ed25519PublicKey(fromHex(config.delegatePublicKey)).toSuiAddress();
  const delegates = account.delegate_keys.map(value => {
    const key = fields(value), bytes = key.public_key;
    if (!Array.isArray(bytes) || bytes.length !== 32 || !bytes.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('Malformed MemWal delegate key.');
    return { publicKey: '0x' + toHex(new Uint8Array(bytes)), address: requireAddress(key.sui_address, 'Delegate address') };
  });
  return { accountId, owner: wallet, active: account.active && account.admin_quarantined !== true, delegateCount: delegates.length,
    delegateAuthorized: delegates.some(key => key.publicKey === config.delegatePublicKey && key.address === expectedAddress) };
}

export async function requireWalletMemoryAccess(wallet: string, profileAccountId: string, client: AccountReader = tatumSuiClient) {
  const account = await fetchWalletMemWalAccount(wallet, client);
  if (!account) throw new Error('Create your wallet-owned MemWal account first.');
  if (account.accountId !== requireAddress(profileAccountId, 'Profile MemWal account')) throw new Error('Save your wallet-owned MemWal account in your on-chain profile first.');
  if (!account.active) throw new Error('Your MemWal account is frozen or quarantined. Manage its activation in MemWal before using memory.');
  if (!account.delegateAuthorized) throw new Error('Authorize SolvencyLoop memory access for your MemWal account first.');
  return account;
}

// Builders use the same wallet signing/execution path as the app's other transactions.
// Building and all chain reads use Tatum; these helpers never hold an owner's private key.
export async function buildCreateMemWalAccountTx(walletAddress: string) {
  const wallet = requireAddress(walletAddress), config = memwalConfig();
  if (await fetchWalletMemWalAccount(wallet)) throw new Error('Your wallet already has a MemWal account. Refresh to reuse it.');
  const tx = new Transaction(); tx.setSender(wallet);
  tx.moveCall({ target: config.packageId + '::account::create_account', arguments: [tx.object(config.registryId), tx.object('0x6')] });
  return tx;
}
export async function buildMemWalDelegateTx(walletAddress: string, action: 'authorize' | 'revoke') {
  const wallet = requireAddress(walletAddress), config = memwalConfig(), account = await fetchWalletMemWalAccount(wallet);
  if (!account) throw new Error('Create your wallet-owned MemWal account first.');
  if (action === 'authorize' && !account.active) throw new Error('Reactivate your MemWal account before authorizing access.');
  if (action === 'authorize' && account.delegateAuthorized) throw new Error('Memory access is already authorized. Refresh state.');
  if (action === 'authorize' && account.delegateCount >= 20) throw new Error('Your MemWal account has reached its delegate limit. Remove an unused key in MemWal first.');
  if (action === 'revoke' && !account.delegateAuthorized) throw new Error('This app’s delegate is not authorized. Refresh state.');
  const tx = new Transaction(); tx.setSender(wallet);
  const args = [tx.object(account.accountId), tx.object(config.registryId), tx.pure.vector('u8', Array.from(fromHex(config.delegatePublicKey)))];
  if (action === 'authorize') args.push(tx.pure.string('SolvencyLoop memory service'), tx.object('0x6'));
  tx.moveCall({ target: config.packageId + '::account::' + (action === 'authorize' ? 'add_delegate_key' : 'remove_delegate_key'), arguments: args });
  return tx;
}
