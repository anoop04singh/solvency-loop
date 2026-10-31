import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MemWal } from '@mysten-incubation/memwal';
import { verifyMainnetReadiness } from '../scripts/verify-mainnet-readiness';
import { tatumSuiClient } from '../src/lib/tatum-rpc-client';
import { normalizedFixture, profileLayoutFixture } from './fixtures/contract-interface';
import type { CORE_INTERFACE } from '../src/lib/contract-interface';
const a = (n: number) => '0x' + n.toString(16).padStart(64, '0');
test('readiness verifies chain and object types, and counts unique readable blobs', async () => {
  const key = Ed25519Keypair.generate();
  const env = { TATUM_API_KEY: 'local-sentinel', MEMWAL_DELEGATE_PRIVATE_KEY: key.getSecretKey(), NEXT_PUBLIC_SOLVENCY_PACKAGE_ID: a(1), NEXT_PUBLIC_SOLVENCY_REGISTRY_ID: a(2), NEXT_PUBLIC_MEMWAL_AGENT_ID: '0x' + Buffer.from(key.getPublicKey().toRawBytes()).toString('hex'), NEXT_PUBLIC_MEMWAL_PACKAGE_ID: a(4), NEXT_PUBLIC_MEMWAL_REGISTRY_ID: a(5), VERIFY_WALLET_ADDRESS: a(6) };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  const backup = { getChainIdentifier: tatumSuiClient.getChainIdentifier, getLatestCheckpointSequenceNumber: tatumSuiClient.getLatestCheckpointSequenceNumber, getObject: tatumSuiClient.getObject, getCoinMetadata: tatumSuiClient.getCoinMetadata, getNormalizedMoveFunction: tatumSuiClient.getNormalizedMoveFunction, getNormalizedMoveStruct: tatumSuiClient.getNormalizedMoveStruct, getAllBalances: tatumSuiClient.getAllBalances, getDynamicFieldObject: tatumSuiClient.getDynamicFieldObject };
  const fetcher = globalThis.fetch, health = MemWal.prototype.health, recall = MemWal.prototype.recall;
  let count = 9, chain = '35834a8a', wrongRegistry = false, granted = true, owner = a(6), legacyInterface = false, transferableProfile = false;
  Object.assign(tatumSuiClient, {
    getChainIdentifier: async () => chain, getLatestCheckpointSequenceNumber: async () => '123',
    getObject: async ({ id }: { id: string }) => id === a(9) ? { data: { objectId: a(9), owner: { AddressOwner: a(6) }, content: { dataType: 'moveObject', type: a(1) + '::core::UserProfile', fields: { id: { id: a(9) }, wallet: a(6), handle: 'owner', memwal_account_id: a(3), safe_floor_usdc: '300000000', contacts: { fields: { contents: [] } } } } } } : ({ data: { owner: { Shared: { initial_shared_version: '1' } }, content: { dataType: 'moveObject', type: id === a(2) ? a(1) + '::core::' + (wrongRegistry ? 'WrongType' : 'SolvencyRegistry') : id === a(3) ? a(4) + '::account::MemWalAccount' : a(4) + '::account::AccountRegistry', fields: id === a(3) ? { owner, active: true, delegate_keys: granted ? [{ fields: { public_key: Array.from(key.getPublicKey().toRawBytes()), sui_address: key.toSuiAddress() } }] : [] } : { accounts: { fields: { id: { id: a(7) } } } } } } }),
    getNormalizedMoveStruct: async () => { const p = profileLayoutFixture(); if (transferableProfile) p.abilities.abilities.push('Store'); return p; },
    getAllBalances: async () => [],
    getDynamicFieldObject: async ({ parentId }: { parentId: string }) => ({ data: { content: { dataType: 'moveObject', type: '0x2::dynamic_field::Field<address, 0x2::object::ID>', fields: { name: a(6), value: parentId === a(7) ? a(3) : a(9) } } } }),
    getCoinMetadata: async () => ({ decimals: 6, symbol: 'USDC' }), getNormalizedMoveFunction: async ({ function: name }: { function: keyof typeof CORE_INTERFACE }) => {
      const fn = normalizedFixture(name, a(1), a(4)); if (legacyInterface && name === 'register_user') fn.parameters[2] = 'Address'; return fn;
    },
  });
  globalThis.fetch = async () => Response.json({ network: 'mainnet', packageId: a(4) });
  MemWal.prototype.health = async () => ({ status: 'ok', version: 'test', write_ready: true, mode: 'production' });
  MemWal.prototype.recall = (async () => ({ results: Array.from({ length: count }, (_, i) => ({ blob_id: 'unique-' + i, text: 'readable memory', distance: 0 })), total: count })) as typeof recall;
  try {
    assert.equal((await verifyMainnetReadiness(() => {})).memoryCount, 9);
    count = 0; assert.equal((await verifyMainnetReadiness(() => {})).memoryCount, 0);
    count = 10; assert.equal((await verifyMainnetReadiness(() => {})).memoryCount, 10); // 30 results but ten unique blobs.
    legacyInterface = true; await assert.rejects(verifyMainnetReadiness(() => {}), /MemWalAccount/); legacyInterface = false;
    transferableProfile = true; await assert.rejects(verifyMainnetReadiness(() => {}), /non-transferable/); transferableProfile = false;
    granted = false; await assert.rejects(verifyMainnetReadiness(() => {}), /Authorize/); granted = true;
    owner = a(8); await assert.rejects(verifyMainnetReadiness(() => {}), /not owned/); owner = a(6);
    chain = '4c78adac'; await assert.rejects(verifyMainnetReadiness(() => {}), /Expected Sui Mainnet/);
    chain = '35834a8a'; wrongRegistry = true; await assert.rejects(verifyMainnetReadiness(() => {}), /shared SolvencyRegistry/);
  } finally {
    Object.assign(tatumSuiClient, backup); globalThis.fetch = fetcher; MemWal.prototype.health = health; MemWal.prototype.recall = recall;
    for (const [k,v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
