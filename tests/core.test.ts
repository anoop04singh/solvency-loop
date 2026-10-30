import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateUnits, positiveUsdc, spendableUsdc, unitsToUsdc, usdcToUnits } from '../src/lib/money';
import { requireAddress, getWalletNamespace } from '../src/lib/config';
import { computeSplit } from '../src/lib/split-rules';
import { validatePayload, type RecalledMemory } from '../src/lib/memory-protocol';
const addr = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const friends = [2, 3, 4].map((n, i) => ({ handle: ['@alex', '@priya', '@sam'][i], walletAddress: addr(n) }));
const rule = (subject: string, data: object): RecalledMemory => ({ blob_id: subject, text: 'SOLVENCY_RULE_V1 ' + JSON.stringify({ subject, ...data }), distance: 0, namespace: 'test', category: 'social_split_trust' });
test('USDC conversion preserves all six decimals and rejects invalid financial inputs', () => {
  assert.equal(usdcToUnits('1.000001'), 1000001n); assert.equal(unitsToUsdc('1000001'), 1.000001);
  for (const bad of [-1, NaN, Infinity, 0.0000001, '1.1234567', '1e9']) assert.throws(() => usdcToUnits(bad));
  assert.throws(() => positiveUsdc(0)); assert.throws(() => usdcToUnits('18446744073710'));
});
test('allocations conserve every micro-USDC', () => {
  for (let i = 0n; i < 20n; i++) assert.equal(allocateUnits(i, 4).reduce((a,b) => a+b, 0n), i);
  const r = computeSplit(addr(1), friends, 11.5, 5, [], false);
  assert.equal(r.shares.reduce((v,s) => v + usdcToUnits(s.amountUsdc), usdcToUnits(r.creatorShare)), 16500000n);
});
test('liquidity availability avoids floating-point subtraction errors', () => {
  assert.equal(spendableUsdc(300.2, 300.1), 0.1);
  assert.equal(spendableUsdc(299, 300), 0);
});
test('saved alcohol rule excludes only the named wallet', () => {
  const r = computeSplit(addr(1), friends, 12, 6, [rule(addr(2), { excludeAlcohol: true })], true);
  assert.equal(r.shares[0].amountUsdc, 3); assert.equal(r.shares[1].amountUsdc, 5); assert.equal(r.creatorShare, 5);
});
test('Sam escrow applies strictly above 40 USDC and can be disabled', () => {
  const memory = [rule(addr(4), { upfrontAboveUsdc: 40 })];
  assert.equal(computeSplit(addr(1), friends, 160, 0, memory, true).shares[2].requiresUpfrontEscrow, false);
  assert.equal(computeSplit(addr(1), friends, 164, 0, memory, true).shares[2].requiresUpfrontEscrow, true);
  assert.equal(computeSplit(addr(1), friends, 164, 0, memory, false).shares[2].requiresUpfrontEscrow, false);
});
test('full-wallet namespace isolation and canonical address validation', () => {
  const one = '0x' + 'a'.repeat(63) + '1', two = '0x' + 'a'.repeat(63) + '2';
  assert.notEqual(getWalletNamespace(one, 'habit_regret'), getWalletNamespace(two, 'habit_regret'));
  assert.throws(() => requireAddress('0xalex')); assert.throws(() => requireAddress('0x' + '1'.repeat(40)));
});
test('split and memory validation reject duplicate wallets and unsupported actions', () => {
  assert.throws(() => computeSplit(addr(1), [friends[0], friends[0], friends[2]], 10, 0, [], true));
  assert.throws(() => validatePayload({ action: 'remember', walletAddress: addr(1), text: '' }));
  assert.throws(() => validatePayload({ action: 'delete_everything', walletAddress: addr(1) }));
  assert.throws(() => validatePayload({ action: 'seed_12_mainnet', walletAddress: addr(1), friendWallets: { alex: addr(2), priya: addr(2), sam: addr(4) } }));
});

test('confirmed settlement observations change future upfront rules', () => {
  const m: RecalledMemory = { blob_id: 'observed', namespace: 'test', category: 'social_split_trust', distance: 0, text: 'SOLVENCY_SETTLEMENT_V1 ' + JSON.stringify({ subject: addr(4), digest: 'unique-transaction', lagMs: 14 * 86400000 }) };
  assert.equal(computeSplit(addr(1), friends, 164, 0, [m], true).shares[2].requiresUpfrontEscrow, true);
  assert.equal(computeSplit(addr(1), friends, 160, 0, [m], true).shares[2].requiresUpfrontEscrow, false);
});
