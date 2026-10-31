import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateUnits, positiveUsdc, spendableUsdc, unitsToUsdc, usdcToUnits } from '../src/lib/money';
import { requireAddress, getWalletNamespace } from '../src/lib/config';
import { validatePayload } from '../src/lib/memory-protocol';
const addr = (n: number) => '0x' + n.toString(16).padStart(64, '0');
test('USDC conversion preserves all six decimals and rejects invalid financial inputs', () => {
  assert.equal(usdcToUnits('1.000001'), 1000001n); assert.equal(unitsToUsdc('1000001'), 1.000001);
  for (const bad of [-1, NaN, Infinity, 0.0000001, '1.1234567', '1e9']) assert.throws(() => usdcToUnits(bad));
  assert.throws(() => positiveUsdc(0)); assert.throws(() => usdcToUnits('18446744073710'));
});
test('allocations conserve every micro-USDC', () => {
  for (let i = 0n; i < 20n; i++) assert.equal(allocateUnits(i, 4).reduce((a,b) => a+b, 0n), i);
});
test('liquidity availability avoids floating-point subtraction errors', () => {
  assert.equal(spendableUsdc(300.2, 300.1), 0.1);
  assert.equal(spendableUsdc(299, 300), 0);
});


test('full-wallet namespace isolation and canonical address validation', () => {
  const one = '0x' + 'a'.repeat(63) + '1', two = '0x' + 'a'.repeat(63) + '2';
  assert.notEqual(getWalletNamespace(one, 'habit_regret'), getWalletNamespace(two, 'habit_regret'));
  assert.throws(() => requireAddress('0xalex')); assert.throws(() => requireAddress('0x' + '1'.repeat(40)));
});
test('split and memory validation reject duplicate wallets and unsupported actions', () => {
  assert.throws(() => validatePayload({ action: 'remember', walletAddress: addr(1), text: '' }));
  assert.throws(() => validatePayload({ action: 'delete_everything', walletAddress: addr(1) }));
  assert.throws(() => validatePayload({ action: 'seed_12_mainnet', walletAddress: addr(1), friendWallets: { alex: addr(2), priya: addr(2), sam: addr(4) } }));
});


