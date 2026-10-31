import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toBase64, toHex } from '@mysten/sui/utils';
import { buildCreateMemWalAccountTx, buildMemWalDelegateTx, fetchWalletMemWalAccount, requireWalletMemoryAccess } from '../src/lib/memwal-account';
import { tatumSuiClient } from '../src/lib/tatum-rpc-client';

const a = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const delegate = Ed25519Keypair.generate(), rawKey = delegate.getPublicKey().toRawBytes();
process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID = a(1); process.env.NEXT_PUBLIC_MEMWAL_REGISTRY_ID = a(2);
process.env.NEXT_PUBLIC_MEMWAL_AGENT_ID = '0x' + toHex(rawKey);
function fixture() {
  let exists = true, active = true, granted = true, owner = a(3), type = a(1) + '::account::MemWalAccount', fail = false, quarantined = false;
  let publicKey: unknown = Array.from(rawKey), delegateAddress = delegate.toSuiAddress(), plainDelegate = false;
  const client = {
    getObject: async ({ id }: { id: string }) => ({ data: { owner: { Shared: { initial_shared_version: '1' } }, content: { dataType: 'moveObject',
      type: id === a(2) ? a(1) + '::account::AccountRegistry' : type,
      fields: id === a(2) ? { accounts: { fields: { id: { id: a(4) }, size: '1' } } } : { owner, active, admin_quarantined: quarantined, delegate_keys: granted ? [plainDelegate ? { public_key: publicKey, sui_address: delegateAddress } : { fields: { public_key: publicKey, sui_address: delegateAddress } }] : [] },
    } } }),
    getDynamicFieldObject: async ({ parentId, name }: { parentId: string; name: { value: unknown } }) => {
      assert.equal(parentId, a(4)); assert.equal(name.value, a(3));
      if (fail) throw new Error('Tatum unavailable');
      return exists ? { data: { content: { dataType: 'moveObject', fields: { value: a(5) } } } } : { error: { code: 'dynamicFieldNotFound' } };
    },
  } as unknown as Pick<typeof tatumSuiClient, 'getObject' | 'getDynamicFieldObject'>;
  return { client, set: (p: { exists?: boolean; active?: boolean; granted?: boolean; owner?: string; type?: string; fail?: boolean; quarantined?: boolean; publicKey?: unknown; delegateAddress?: string; plainDelegate?: boolean }) => {
    exists = p.exists ?? exists; active = p.active ?? active; granted = p.granted ?? granted; owner = p.owner ?? owner; type = p.type ?? type; fail = p.fail ?? fail; quarantined = p.quarantined ?? quarantined;
    if ('publicKey' in p) publicKey = p.publicKey;
    delegateAddress = p.delegateAddress ?? delegateAddress; plainDelegate = p.plainDelegate ?? plainDelegate;
  } };
}

test('account discovery follows the shared registry table and verifies owner, type and live grants', async () => {
  const f = fixture();
  assert.deepEqual(await fetchWalletMemWalAccount(a(3), f.client), { accountId: a(5), owner: a(3), active: true, delegateAuthorized: true, delegateCount: 1 });
  assert.equal((await requireWalletMemoryAccess(a(3), a(5), f.client)).accountId, a(5));
  await assert.rejects(requireWalletMemoryAccess(a(3), a(6), f.client), /on-chain profile/);
  f.set({ granted: false }); await assert.rejects(requireWalletMemoryAccess(a(3), a(5), f.client), /Authorize/);
  f.set({ granted: true, active: false }); await assert.rejects(requireWalletMemoryAccess(a(3), a(5), f.client), /frozen/);
  f.set({ active: true, quarantined: true }); await assert.rejects(requireWalletMemoryAccess(a(3), a(5), f.client), /quarantined/);
  f.set({ quarantined: false, owner: a(7) }); await assert.rejects(fetchWalletMemWalAccount(a(3), f.client), /not owned/);
  f.set({ owner: a(3), type: a(8) + '::account::MemWalAccount' }); await assert.rejects(fetchWalletMemWalAccount(a(3), f.client), /could not be verified/);
});

test('GraphQL Base64 delegates are recognized after authorization without a duplicate grant', async () => {
  const f = fixture(), backup = { getObject: tatumSuiClient.getObject, getDynamicFieldObject: tatumSuiClient.getDynamicFieldObject };
  f.set({ publicKey: toBase64(rawKey), plainDelegate: true });
  Object.assign(tatumSuiClient, f.client);
  try {
    assert.equal((await fetchWalletMemWalAccount(a(3)))?.delegateAuthorized, true);
    assert.equal((await requireWalletMemoryAccess(a(3), a(5))).accountId, a(5));
    await assert.rejects(buildMemWalDelegateTx(a(3), 'authorize'), /already authorized/);
    const revoke = await buildMemWalDelegateTx(a(3), 'revoke');
    assert.equal(revoke.getData().commands[0].MoveCall?.function, 'remove_delegate_key');
    f.set({ publicKey: Array.from(rawKey), plainDelegate: false });
    assert.equal((await requireWalletMemoryAccess(a(3), a(5))).delegateAuthorized, true);
  } finally { Object.assign(tatumSuiClient, backup); }
});

test('malformed delegate encodings and mismatched identities cannot grant memory access', async () => {
  const f = fixture();
  f.set({ plainDelegate: true });
  const base64 = toBase64(rawKey);
  // The last Base64 data character has two zero padding bits for a 32-byte key.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const noncanonical = base64.slice(0, 42) + alphabet[alphabet.indexOf(base64[42]) + 1] + '=';
  for (const publicKey of [undefined, null, '', base64.slice(0, -1), ' '+base64, base64.replace(/.$/, '!'), noncanonical,
    toBase64(rawKey.slice(1)), toBase64(new Uint8Array(33)), '0x'+toHex(rawKey), Array(32).fill(-1), Array(32).fill(256), Array(32).fill('0'), Array(32).fill(0.5)]) {
    f.set({ publicKey });
    await assert.rejects(fetchWalletMemWalAccount(a(3), f.client), /Malformed MemWal delegate key/);
  }
  const otherDelegate = Ed25519Keypair.generate();
  f.set({ publicKey: toBase64(otherDelegate.getPublicKey().toRawBytes()), delegateAddress: otherDelegate.toSuiAddress() });
  await assert.rejects(requireWalletMemoryAccess(a(3), a(5), f.client), /Authorize/);
  f.set({ publicKey: base64, delegateAddress: otherDelegate.toSuiAddress() });
  await assert.rejects(requireWalletMemoryAccess(a(3), a(5), f.client), /Authorize/);
  f.set({ delegateAddress: delegate.toSuiAddress(), owner: a(7) });
  await assert.rejects(fetchWalletMemWalAccount(a(3), f.client), /not owned/);
});

test('only a definitive missing registry entry enables creation, and existing accounts are reused', async () => {
  const f = fixture(), backup = { getObject: tatumSuiClient.getObject, getDynamicFieldObject: tatumSuiClient.getDynamicFieldObject };
  Object.assign(tatumSuiClient, f.client);
  try {
    await assert.rejects(buildCreateMemWalAccountTx(a(3)), /already has/);
    f.set({ exists: false }); assert.equal(await fetchWalletMemWalAccount(a(3)), null);
    const tx = await buildCreateMemWalAccountTx(a(3)), call = tx.getData().commands[0].MoveCall!;
    assert.equal(tx.getData().sender, a(3)); assert.equal(call.package, a(1)); assert.equal(call.function, 'create_account');
    f.set({ fail: true }); await assert.rejects(buildCreateMemWalAccountTx(a(3)), /Tatum unavailable/);
  } finally { Object.assign(tatumSuiClient, backup); }
});

test('delegate builders target the discovered account and require an explicit current grant transition', async () => {
  const f = fixture(), backup = { getObject: tatumSuiClient.getObject, getDynamicFieldObject: tatumSuiClient.getDynamicFieldObject };
  Object.assign(tatumSuiClient, f.client);
  try {
    const revoke = await buildMemWalDelegateTx(a(3), 'revoke');
    assert.equal(revoke.getData().commands[0].MoveCall?.function, 'remove_delegate_key');
    assert.ok(JSON.stringify(revoke.getData()).includes(a(5)));
    assert.equal(revoke.getData().commands[0].MoveCall?.arguments.length, 3);
    await assert.rejects(buildMemWalDelegateTx(a(3), 'authorize'), /already authorized/);
    f.set({ granted: false });
    await assert.rejects(buildMemWalDelegateTx(a(3), 'revoke'), /not authorized/);
    const authorize = await buildMemWalDelegateTx(a(3), 'authorize');
    assert.equal(authorize.getData().commands[0].MoveCall?.function, 'add_delegate_key');
    assert.equal(authorize.getData().commands[0].MoveCall?.arguments.length, 5);
    f.set({ owner: a(7) }); await assert.rejects(buildMemWalDelegateTx(a(3), 'authorize'), /not owned/);
  } finally { Object.assign(tatumSuiClient, backup); }
});
