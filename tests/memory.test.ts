import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMemoryRequest, type MemoryDependencies } from '../src/lib/memory-service';
import type { MemoryPayload } from '../src/lib/memory-protocol';
const address = '0x' + '1'.repeat(64);
process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID = address;
const state = { wallet: address, handle: 'test', memwalAccountId: address, safeFloorUsdc: 300, contacts: [], usdcBalance: 500, suiBalance: 1, latestCheckpoint: '123', isRegisteredOnChain: true };
function dependencies(overrides: Partial<ReturnType<MemoryDependencies['client']>> = {}) {
  const client = { recall: async () => ({ results: [], total: 0 }), rememberAndWait: async () => ({ id: 'job', blob_id: 'real-test-result', namespace: 'test', owner: address }), analyzeAndWait: async () => ({}), restore: async () => ({ failed: 0, restored: 1, total: 1, skipped: 0, truncated: false, namespace: 'test', owner: address }), ...overrides };
  return { client: () => client, state: async () => state, transaction: async () => ({ effects: { status: { status: 'success' } }, events: [] }), object: async () => ({}) } as unknown as MemoryDependencies;
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
