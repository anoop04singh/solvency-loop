import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMemoryRequest, type MemoryDependencies } from '../src/lib/memory-service';
import type { MemoryPayload } from '../src/lib/memory-protocol';
import { SUI_MAINNET_USDC_TYPE } from '../src/lib/config';
const address = '0x' + '1'.repeat(64);
const state = { profileId: address, wallet: address, handle: 'test', memwalAccountId: address, safeFloorUsdc: 300, contacts: [], usdcBalance: 500, suiBalance: 1, latestCheckpoint: '123', isRegisteredOnChain: true };
function dependencies(overrides: Partial<ReturnType<MemoryDependencies['client']>> = {}) {
  const client = { recall: async () => ({ results: [], total: 0 }), rememberAndWait: async () => ({ id: 'job', blob_id: 'real-test-result', namespace: 'test', owner: address }), analyzeAndWait: async () => ({}), restore: async () => ({ failed: 0, restored: 1, total: 1, skipped: 0, truncated: false, namespace: 'test', owner: address }), ...overrides };
  return { client: () => client, access: async () => ({ accountId: address, owner: address, active: true, delegateAuthorized: true, delegateCount: 1 }), state: async () => state, transaction: async () => ({ effects: { status: { status: 'success' } }, events: [] }), object: async () => ({}) } as unknown as MemoryDependencies;
}
test('recall failures propagate instead of being converted into empty successful results', async () => {
  await assert.rejects(executeMemoryRequest({ action: 'recall_all', walletAddress: address }, 'nonce', dependencies({ recall: async () => { throw new Error('relayer unavailable'); } })), /relayer unavailable/);
});
test('seed waits for actual commits and only then acknowledges twelve blobs', async () => {
  let resolve!: () => void, committed = 0, finished = false;
  const gate = new Promise<void>(r => { resolve = r; });
  const p: MemoryPayload = { action: 'seed_12_mainnet', walletAddress: address, friendWallets: { alex: '0x'+'2'.repeat(64), priya: '0x'+'3'.repeat(64), sam: '0x'+'4'.repeat(64) } };
  const pending = executeMemoryRequest(p, 'signed-request-id', dependencies({ rememberAndWait: async () => { await gate; committed++; return { id: String(committed), blob_id: 'blob-' + committed, owner: address, namespace: 'test' }; } })).then(r => { finished = true; return r; });
  await new Promise(r => setImmediate(r)); assert.equal(finished, false); assert.equal(committed, 0);
  resolve(); const result = await pending; assert.equal(result.count, 12); assert.equal(committed, 12);
});
test('permanent restore failures do not produce a recovery success claim', async () => {
  await assert.rejects(executeMemoryRequest({ action: 'restore', walletAddress: address }, 'nonce', dependencies({ restore: async () => ({ failed: 1, restored: 0, total: 1, skipped: 0, truncated: false, namespace: 'test', owner: address }) })), /could not be restored/);
});
test('settlement learning cannot accept a digest without matching on-chain events', async () => {
  process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID = address; process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID = address;
  let writes = 0;
  await assert.rejects(executeMemoryRequest({ action: 'settlement', walletAddress: address, digest: 'unused-by-mock' }, 'nonce', dependencies({ rememberAndWait: async () => { writes++; throw new Error('must not write'); } })), /No matching settlement/);
  assert.equal(writes, 0);
});

test('each signed wallet uses its verified account rather than a caller or global account ID', async () => {
  const calls: { wallet: string; account: string }[] = [], owners = [address, '0x' + '2'.repeat(64)];
  const accountFor = (wallet: string) => '0x' + (wallet === address ? '3' : '4').repeat(64);
  const deps = dependencies();
  const client = deps.client;
  deps.state = async wallet => ({ ...state, wallet, memwalAccountId: accountFor(wallet) });
  deps.access = async (wallet, accountId) => ({ accountId, owner: wallet, active: true, delegateAuthorized: true, delegateCount: 1 });
  deps.client = (wallet, category, account) => { calls.push({ wallet, account }); return client(wallet, category, account); };
  for (const wallet of owners) await executeMemoryRequest({ action: 'recall_all', walletAddress: wallet, accountId: 'untrusted' } as MemoryPayload, 'nonce', deps);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.map(c => c.account), owners.flatMap(w => Array(3).fill(accountFor(w))));
  assert.deepEqual(calls.map(c => c.wallet), owners.flatMap(w => Array(3).fill(w)));
});

test('all memory actions reject denied ownership/delegate checks before constructing any client', async () => {
  const deps = dependencies(); let created = 0;
  deps.access = async () => { throw new Error('delegate revoked'); };
  deps.client = () => { created++; throw new Error('must not construct'); };
  for (const action of ['recall_all', 'remember', 'analyze', 'restore', 'seed_12_mainnet', 'settlement', 'sync_settlements'] as const) {
    await assert.rejects(executeMemoryRequest({ action, walletAddress: address }, 'nonce', deps), /delegate revoked/);
  }
  assert.equal(created, 0);
});

test('settlement learning writes only the signing wallet and imports recipient history with stable event keys', async () => {
  process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID = address; process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID = address;
  const recipient = '0x' + '2'.repeat(64), accountIds = new Map([[address, '0x' + '3'.repeat(64)], [recipient, '0x' + '4'.repeat(64)]]);
  const digest = '3'.repeat(44), event = { id: { txDigest: digest, eventSeq: '7' }, type: address + '::core::ShareSettledEvent', parsedJson: { payer: address, recipient, split_id: '0x' + '5'.repeat(64), amount: '4000000', settled_at_ms: '864000000' } };
  const writes: { wallet: string; accountId: string; key: string | undefined }[] = [];
  const deps = dependencies();
  deps.state = async wallet => ({ ...state, wallet, memwalAccountId: accountIds.get(wallet)! });
  deps.access = async (wallet, accountId) => ({ accountId, owner: wallet, active: true, delegateAuthorized: true, delegateCount: 1 });
  deps.client = (wallet, category, accountId) => dependencies({ rememberAndWait: async (_text, options) => {
    assert.equal(typeof options === 'object' && options.dedupe, true); // Re-imports also dedupe after the relayer's retry window.
    writes.push({ wallet, accountId, key: typeof options === 'object' ? options.idempotencyKey : undefined });
    return { id: 'job', blob_id: 'blob', owner: wallet, namespace: category };
  } }).client(wallet, category, accountId);
  deps.transaction = (async () => ({ effects: { status: { status: 'success' } }, events: [event], checkpoint: '100' })) as unknown as MemoryDependencies['transaction'];
  deps.object = (async () => ({ data: { content: { dataType: 'moveObject', type: address + '::core::GroupSplitEscrow<' + SUI_MAINNET_USDC_TYPE + '>', fields: { created_at_ms: '1' } } } })) as unknown as MemoryDependencies['object'];
  const cursor = { txDigest: digest, eventSeq: '7' };
  deps.events = (async () => ({ data: [event], hasNextPage: true, nextCursor: cursor })) as unknown as MemoryDependencies['events'];
  assert.equal((await executeMemoryRequest({ action: 'settlement', walletAddress: address, digest }, 'nonce', deps)).count, 1);
  assert.deepEqual(writes.map(w => w.wallet), [address]);
  const imported = await executeMemoryRequest({ action: 'sync_settlements', walletAddress: recipient }, 'other-nonce', deps);
  assert.equal(imported.count, 1); assert.deepEqual(imported.nextCursor, cursor);
  assert.deepEqual(writes.map(w => w.accountId), [accountIds.get(address), accountIds.get(recipient)]);
  await executeMemoryRequest({ action: 'settlement', walletAddress: recipient, digest }, 'new-nonce', deps);
  assert.equal(writes[1].key, writes[2].key); // Direct retry and history import identify the same observation.
  await assert.rejects(executeMemoryRequest({ action: 'sync_settlements', walletAddress: recipient, cursor }, 'nonce', deps), /pagination did not advance/);
  deps.transaction = (async () => ({ effects: { status: { status: 'failure' } }, events: [event] })) as unknown as MemoryDependencies['transaction'];
  await assert.rejects(executeMemoryRequest({ action: 'sync_settlements', walletAddress: recipient }, 'nonce', deps), /successful on-chain/);
  assert.equal(writes.length, 3);
});
