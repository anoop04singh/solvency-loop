import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MemWal } from '@mysten-incubation/memwal';
import { memorySigningMessage, type MemoryEnvelope } from '../src/lib/memory-protocol';
import { verifyMemoryEnvelope } from '../src/lib/memory-auth';
import { validateRpcPayload } from '../src/lib/rpc-proxy';
import { createTatumRequester } from '../src/lib/tatum-request';
import { createTatumSuiClient, tatumSuiClient } from '../src/lib/tatum-rpc-client';
import { verifyMainnetReadiness } from '../scripts/verify-mainnet-readiness';
const origin = 'http://localhost:3000', key = Ed25519Keypair.generate();
async function signed() {
  const e = { payload: { action: 'recall_all' as const, walletAddress: key.toSuiAddress() }, nonce: '1234567890abcdef', issuedAt: Date.now(), origin };
  const { signature } = await key.signPersonalMessage(new TextEncoder().encode(memorySigningMessage(e))); return { ...e, signature };
}
test('real wallet signatures authorize exactly their signed payload and origin', async () => {
  const e = await signed();
  assert.equal((await verifyMemoryEnvelope(e, origin)).payload.walletAddress, key.toSuiAddress());
  await assert.rejects(verifyMemoryEnvelope({ ...e, payload: { ...e.payload, query: 'tampered' } }, origin));
  await assert.rejects(verifyMemoryEnvelope(e, 'http://other.example'));
  await assert.rejects(verifyMemoryEnvelope(e, origin, e.issuedAt + 120001));
  const other = Ed25519Keypair.generate();
  await assert.rejects(verifyMemoryEnvelope({ ...e, payload: { ...e.payload, walletAddress: other.toSuiAddress() } }, origin));
  await assert.rejects(verifyMemoryEnvelope({ payload: e.payload } as MemoryEnvelope, origin));
});
test('RPC proxy enforces the fixed Mainnet gateway and server-side authentication', async () => {
  const old = process.env.TATUM_API_KEY; process.env.TATUM_API_KEY = 'test-server-only-key';
  try {
    let called = false;
    const fake = (async (url: RequestInfo | URL, init?: RequestInit) => {
      called = true; assert.equal(url, 'https://sui-mainnet.gateway.tatum.io/graphql');
      assert.equal(new Headers(init?.headers).get('x-api-key'), 'test-server-only-key');
      return Response.json({ data: { checkpoint: { sequenceNumber: 123 } } });
    }) as typeof fetch;
    const request = createTatumRequester(fake, {intervalMs:0});
    await request({ query: 'query { checkpoint { sequenceNumber } }' });
    assert.ok(called); called = false; delete process.env.TATUM_API_KEY;
    await assert.rejects(request({ query: 'query { checkpoint { sequenceNumber } }' })); assert.equal(called, false);
    assert.throws(() => validateRpcPayload([])); assert.throws(() => validateRpcPayload({ jsonrpc: '2.0', method: 'unsafe_transferObject', params: [] }));
  } finally { if (old === undefined) delete process.env.TATUM_API_KEY; else process.env.TATUM_API_KEY = old; }
});
test('shared Sui client transport cannot fall back to an environment override', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.TATUM_API_KEY;
  process.env.TATUM_API_KEY = 'transport-sentinel';
  try {
    globalThis.fetch = (async (url, init) => { assert.equal(url, 'https://sui-mainnet.gateway.tatum.io/graphql'); assert.equal(new Headers(init?.headers).get('x-api-key'), 'transport-sentinel'); return Response.json({ data: { checkpoint: { sequenceNumber: 9 } } }); }) as typeof fetch;
    assert.equal(await createTatumSuiClient().getLatestCheckpointSequenceNumber(), '9');
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.TATUM_API_KEY; else process.env.TATUM_API_KEY = oldKey; }
});
test('pinned MemWal patch injects the Tatum client for relayer SEAL sessions', () => {
  const c = MemWal.create({ key: new Uint8Array(32).fill(1), accountId: '0x' + '1'.repeat(64), suiClient: tatumSuiClient });
  assert.equal((c as unknown as { solvencySuiClient: unknown }).solvencySuiClient, tatumSuiClient); c.destroy();
});
test('readiness rejects absent configuration instead of printing a false pass', async () => {
  const old = process.env.TATUM_API_KEY; delete process.env.TATUM_API_KEY;
  try { await assert.rejects(verifyMainnetReadiness(() => { throw new Error('A PASS was incorrectly printed.'); }), /Missing configuration/); }
  finally { if (old !== undefined) process.env.TATUM_API_KEY = old; }
});

test('MemWal builds a real SEAL session using only the injected client', async () => {
  const c = MemWal.create({ key: new Uint8Array(32).fill(2), accountId: '0x' + '1'.repeat(64), suiClient: tatumSuiClient });
  const internal = c as unknown as { fetchServerConfig: () => Promise<unknown>; buildSealSessionInner: () => Promise<unknown> };
  internal.fetchServerConfig = async () => ({ network: 'mainnet', packageId: '0x' + '2'.repeat(64), suiTransport: 'grpc', suiGrpcUrl: 'https://must-not-contact.invalid', suiRpcUrl: 'https://must-not-contact.invalid' });
  const getObject = tatumSuiClient.core.getObject, oldFetch = globalThis.fetch; let reads = 0;
  Object.assign(tatumSuiClient.core, { getObject: async () => { reads++; return { object: { version: '1' } }; } });
  globalThis.fetch = async () => { throw new Error('Unexpected external transport used by SEAL session'); };
  try { assert.ok(await internal.buildSealSessionInner()); assert.equal(reads, 1); }
  finally { Object.assign(tatumSuiClient.core, { getObject }); globalThis.fetch = oldFetch; c.destroy(); }
});

test('origin checks preserve the browser Host when Next normalizes loopback URLs', async () => {
  const { requestOrigin } = await import('../src/lib/http-origin');
  const old = process.env.APP_ORIGIN; delete process.env.APP_ORIGIN;
  try {
    assert.equal(requestOrigin(new Request('http://localhost:3000/api/memory', { headers: { host: '127.0.0.1:3000' } })), 'http://127.0.0.1:3000');
    process.env.APP_ORIGIN = 'https://finance.example';
    assert.equal(requestOrigin(new Request('http://localhost:3000/api/memory')), 'https://finance.example');
  } finally { if (old === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = old; }
});
