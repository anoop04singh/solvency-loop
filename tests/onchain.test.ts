import test from 'node:test';
import assert from 'node:assert/strict';
import { tatumSuiClient } from '../src/lib/tatum-rpc-client';
import { buildLockInCooldownVaultTx, fetchActiveGroupSplitsViaTatum, fetchOwnedCooldownVaultsViaTatum } from '../src/lib/onchain-user-manager';
import { SUI_MAINNET_USDC_TYPE } from '../src/lib/config';
import { installOnboardingFixture } from './fixtures/onboarding';
const a = (n: number) => '0x' + n.toString(16).padStart(64, '0');
process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID = a(1); process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID = a(2);
test('vault builder paginates coins and rejects an insufficient actual reserve', async () => {
  const fixture = installOnboardingFixture();
  const backup = { getCoins: tatumSuiClient.getCoins };
  const cursors: unknown[] = [];
  Object.assign(tatumSuiClient, {
    getCoins: async ({ cursor }: { cursor: string | null }) => { cursors.push(cursor); return cursor ? { data: [{ coinObjectId: a(11), balance: '300000000' }], hasNextPage: false } : { data: [{ coinObjectId: a(10), balance: '100000000' }], hasNextPage: true, nextCursor: 'next-page' }; },
  });
  try {
    const tx = await buildLockInCooldownVaultTx({ ownerAddress: a(5), amountUsdc: 100 });
    assert.deepEqual(cursors, [null, 'next-page']);
    assert.deepEqual(tx.getData().commands.map(c => c.$kind), ['MergeCoins', 'SplitCoins', 'MoveCall']);
    const move = tx.getData().commands[2].MoveCall!; assert.equal(move.function, 'lock_in_cooldown_vault'); assert.deepEqual(move.typeArguments, [SUI_MAINNET_USDC_TYPE]);
    Object.assign(tatumSuiClient, { getCoins: async () => ({ data: [{ coinObjectId: a(10), balance: '399999999' }], hasNextPage: false }) });
    await assert.rejects(buildLockInCooldownVaultTx({ ownerAddress: a(5), amountUsdc: 100 }), /Insufficient Circle USDC/);
  } finally { Object.assign(tatumSuiClient, backup); fixture.restore(); }
});
test('split history and owned vault readers continue through every page', async () => {
  const backup = { queryEvents: tatumSuiClient.queryEvents, multiGetObjects: tatumSuiClient.multiGetObjects, getOwnedObjects: tatumSuiClient.getOwnedObjects };
  let eventPages = 0, vaultPages = 0;
  Object.assign(tatumSuiClient, {
    queryEvents: async ({ cursor }: { cursor: unknown }) => { eventPages++; return { data: [{ parsedJson: { split_id: cursor ? a(12) : a(11) } }], hasNextPage: !cursor, nextCursor: cursor ? null : { txDigest: 'next', eventSeq: '1' } }; },
    multiGetObjects: async ({ ids }: { ids: string[] }) => ids.map(id => ({ data: { objectId: id, content: { dataType: 'moveObject', fields: { creator: a(5), title: 'bill', total_bill_amount: '4000000', creator_share: '1000000', created_at_ms: '1', funding_deadline_ms: '100', is_active: true, is_cancelled: false, pending_upfront: '0', participants: { fields: { contents: [] } } } } } })),
    getOwnedObjects: async ({ cursor }: { cursor: unknown }) => { vaultPages++; return { data: [{ data: { objectId: cursor ? a(21) : a(20), content: { dataType: 'moveObject', fields: { locked_balance: cursor ? { fields: { value: '2000000' } } : '1000000', unlock_time_ms: '100', trigger_memory_namespace: 'habit_regret' } } } }], hasNextPage: !cursor, nextCursor: cursor ? null : 'next' }; },
  });
  try {
    assert.equal((await fetchActiveGroupSplitsViaTatum(a(5))).length, 2); assert.equal(eventPages, 2);
    const vaults = await fetchOwnedCooldownVaultsViaTatum(a(5)); assert.deepEqual(vaults.map(v => v.amountUsdc), [1, 2]); assert.equal(vaultPages, 2);
  } finally { Object.assign(tatumSuiClient, backup); }
});
