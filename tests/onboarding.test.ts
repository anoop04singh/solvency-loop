import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingStatus } from '../src/lib/onboarding';
import { assertContractInterface, CORE_INTERFACE } from '../src/lib/contract-interface';
import { buildCreateGroupSplitTx, buildRegisterUserAndContactsTx, buildSettleSplitShareTx, buildSplitActionTx, buildLockInCooldownVaultTx, buildUnlockCooldownVaultTx, fetchFullUserStateViaTatum } from '../src/lib/onchain-user-manager';
import { fetchWalletMemWalAccount } from '../src/lib/memwal-account';
import { executeMemoryRequest } from '../src/lib/memory-service';
import { SUI_MAINNET_USDC_TYPE } from '../src/lib/config';
import { bcs } from '@mysten/sui/bcs';
import { fromBase64 } from '@mysten/sui/utils';
import { a, installOnboardingFixture } from './fixtures/onboarding';
import { normalizedFixture as normalized } from './fixtures/contract-interface';
const normalizedFixture = (name: keyof typeof CORE_INTERFACE) => normalized(name, a(1), a(6));
function inputIndex(arg: unknown): number {
  assert.ok(arg && typeof arg === 'object' && 'Input' in arg && typeof arg.Input === 'number');
  return arg.Input;
}
const splitInput = { walletAddress: a(5), title: 'Dinner', totalAmountUsdc: 20, shares: [{ debtorAddress: a(11), amountUsdc: 10, requiresUpfrontEscrow: false }] };

test('dashboard access requires an owned MemWal account, active authorization and matching profile', async () => {
  const f = installOnboardingFixture();
  try {
    const p = await fetchFullUserStateViaTatum(f.wallet), m = await fetchWalletMemWalAccount(f.wallet);
    assert.deepEqual(onboardingStatus(p, m), { ready: true, canRecover: true });
    assert.equal(onboardingStatus(p, null).ready, false);
    assert.equal(onboardingStatus({ ...p, isRegisteredOnChain: false }, m).ready, false);
    assert.equal(onboardingStatus({ ...p, profileId: '' }, m).ready, false);
    assert.equal(onboardingStatus(p, { ...m!, owner: a(12) }).canRecover, false);
    assert.equal(onboardingStatus({ ...p, memwalAccountId: a(12) }, m).canRecover, false);
    assert.deepEqual(onboardingStatus(p, { ...m!, active: false }), { ready: false, canRecover: true });
    assert.deepEqual(onboardingStatus(p, { ...m!, delegateAuthorized: false }), { ready: false, canRecover: true });
  } finally { f.restore(); }
});

test('financial builders cannot create or pay before complete MemWal onboarding', async () => {
  const f = installOnboardingFixture();
  try {
    for (const missing of ['registered', 'exists', 'active', 'authorized'] as const) {
      f.state[missing] = false;
      await assert.rejects(buildCreateGroupSplitTx(splitInput), /MemWal account/);
      await assert.rejects(buildSettleSplitShareTx({ payerAddress: f.wallet, splitObjectId: a(12), amountUsdc: 10 }), /MemWal account/);
      await assert.rejects(buildSplitActionTx(f.wallet, a(12), 'activate_group_split'), /MemWal account/);
      await assert.rejects(buildLockInCooldownVaultTx({ ownerAddress: f.wallet, amountUsdc: 10 }), /MemWal account/);
      f.state[missing] = true;
    }
    assert.equal(f.state.coinReads, 0);
    f.state.authorized = false;
    await assert.rejects(buildRegisterUserAndContactsTx({ walletAddress: f.wallet, handle: 'owner', memwalAccountId: f.memoryId, safeFloorUsdc: 300, friends: [] }), /authorize the app/);
    // Existing funds remain recoverable by the registered account owner after revocation.
    assert.equal((await buildSplitActionTx(f.wallet, a(12), 'refund_escrow')).getData().commands[0].MoveCall?.function, 'refund_escrow');
    assert.equal((await buildUnlockCooldownVaultTx({ ownerAddress: f.wallet, vaultObjectId: a(13) })).getData().commands[0].MoveCall?.function, 'unlock_cooldown_vault');
    f.state.exists = false;
    await assert.rejects(buildSplitActionTx(f.wallet, a(12), 'refund_escrow'), /MemWal account/);
    await assert.rejects(buildUnlockCooldownVaultTx({ ownerAddress: f.wallet, vaultObjectId: a(13) }), /MemWal account/);
  } finally { f.restore(); }
});

test('all financial builders supply the owned profile and genuine MemWal object in the current contract argument positions', async () => {
  const f = installOnboardingFixture();
  try {
    const transactions = [
      await buildRegisterUserAndContactsTx({ walletAddress: f.wallet, handle: 'owner', memwalAccountId: f.memoryId, safeFloorUsdc: 300, friends: [] }),
      await buildCreateGroupSplitTx(splitInput),
      await buildSettleSplitShareTx({ payerAddress: f.wallet, splitObjectId: a(12), amountUsdc: 10 }),
      await buildSettleSplitShareTx({ payerAddress: f.wallet, splitObjectId: a(12), amountUsdc: 10, upfront: true }),
      await buildSplitActionTx(f.wallet, a(12), 'activate_group_split'),
      await buildSplitActionTx(f.wallet, a(12), 'cancel_group_split'),
      await buildSplitActionTx(f.wallet, a(12), 'refund_escrow'),
      await buildLockInCooldownVaultTx({ ownerAddress: f.wallet, amountUsdc: 10 }),
      await buildUnlockCooldownVaultTx({ ownerAddress: f.wallet, vaultObjectId: a(13) }),
    ];
    for (const tx of transactions) {
      const data = tx.getData(), command = data.commands.find(c => c.MoveCall);
      assert.ok(command?.MoveCall);
      const call = command.MoveCall;
      const expected = CORE_INTERFACE[call.function as keyof typeof CORE_INTERFACE];
      assert.equal(call.arguments.length, expected.arguments, call.function);
      assert.equal(call.package, a(1)); assert.equal(data.sender, f.wallet);
      assert.deepEqual(call.typeArguments, expected.generic ? [SUI_MAINNET_USDC_TYPE] : []);
      const memoryInput = call.arguments[expected.memoryIndex!];
      assert.equal(memoryInput.$kind, 'Input');
      assert.equal(data.inputs[memoryInput.Input!].UnresolvedObject?.objectId, f.memoryId);
      assert.equal(data.inputs[inputIndex(call.arguments[0])].UnresolvedObject?.objectId, f.profileId);
      assert.ok(!data.inputs.some(i => i.UnresolvedObject?.objectId === a(2)), 'Registry must not be a transaction input after registration');
    }
  } finally { f.restore(); }
});

test('first registration creates the profile and initial contacts in one factory call', async () => {
  const f = installOnboardingFixture();
  try {
    f.state.registered = false;
    const data = (await buildRegisterUserAndContactsTx({ walletAddress: f.wallet, handle: 'owner', memwalAccountId: f.memoryId, safeFloorUsdc: 300, friends: [{ address: a(11), handle: 'friend' }] })).getData();
    assert.equal(data.commands.length, 1);
    const call = data.commands[0].MoveCall!;
    assert.equal(call.function, 'register_user'); assert.equal(call.arguments.length, 7);
    assert.equal(data.inputs[inputIndex(call.arguments[0])].UnresolvedObject?.objectId, a(2));
    assert.equal(data.inputs[inputIndex(call.arguments[2])].UnresolvedObject?.objectId, f.memoryId);
    assert.deepEqual(bcs.vector(bcs.Address).parse(fromBase64(data.inputs[inputIndex(call.arguments[4])].Pure!.bytes)), [a(11)]);
    assert.deepEqual(bcs.vector(bcs.String).parse(fromBase64(data.inputs[inputIndex(call.arguments[5])].Pure!.bytes)), ['friend']);
  } finally { f.restore(); }
});

test('existing profile updates and contact replacement use its live owned object without the global registry', async () => {
  const f = installOnboardingFixture();
  try {
    f.state.contacts = [{ walletAddress: a(11), handle: 'old' }];
    const data = (await buildRegisterUserAndContactsTx({ walletAddress: f.wallet, handle: 'renamed', memwalAccountId: f.memoryId, safeFloorUsdc: 200, friends: [{ address: a(12), handle: 'new' }] })).getData();
    assert.deepEqual(data.commands.map(c => c.MoveCall?.function), ['update_profile', 'remove_contact', 'add_contact']);
    for (const command of data.commands) {
      const call = command.MoveCall!, expected = CORE_INTERFACE[call.function as keyof typeof CORE_INTERFACE];
      assert.equal(call.arguments.length, expected.arguments);
      assert.equal(data.inputs[inputIndex(call.arguments[0])].UnresolvedObject?.objectId, f.profileId);
      assert.equal(data.inputs[inputIndex(call.arguments[expected.memoryIndex])].UnresolvedObject?.objectId, f.memoryId);
    }
    assert.ok(!data.inputs.some(i => i.UnresolvedObject?.objectId === a(2)));
  } finally { f.restore(); }
});

test('foreign, missing and legacy profiles fail closed before registration or financial construction', async () => {
  const f = installOnboardingFixture();
  const save = () => buildRegisterUserAndContactsTx({ walletAddress: f.wallet, handle: 'owner', memwalAccountId: f.memoryId, safeFloorUsdc: 300, friends: [] });
  try {
    for (const bad of ['profileUnavailable', 'directoryError', 'directoryLegacy'] as const) {
      f.state[bad] = true;
      await assert.rejects(fetchFullUserStateViaTatum(f.wallet));
      await assert.rejects(save()); await assert.rejects(buildCreateGroupSplitTx(splitInput));
      f.state[bad] = false;
    }
    for (const bad of ['profileOwner', 'profileWallet', 'profileType'] as const) {
      const before = f.state[bad]; f.state[bad] = bad === 'profileType' ? 'OtherType' : a(99);
      await assert.rejects(fetchFullUserStateViaTatum(f.wallet));
      await assert.rejects(save()); await assert.rejects(buildSettleSplitShareTx({ payerAddress: f.wallet, splitObjectId: a(12), amountUsdc: 10 }));
      f.state[bad] = before;
    }
    assert.equal(f.state.coinReads, 0);
  } finally { f.restore(); }
});

test('memory requests verify live profile ownership before constructing a MemWal client', async () => {
  const f = installOnboardingFixture();
  try {
    f.state.profileOwner = a(99);
    for (const action of ['recall_all', 'remember', 'analyze', 'restore', 'save_preference', 'settlement', 'sync_settlements'] as const) {
      await assert.rejects(executeMemoryRequest({ action, walletAddress: f.wallet }, 'test-nonce'), /UserProfile is not owned/);
    }
    f.state.profileOwner = f.wallet; f.state.registered = false;
    await assert.rejects(executeMemoryRequest({ action: 'recall_all', walletAddress: f.wallet }, 'test-nonce'), /Register your wallet-owned/);
  } finally { f.restore(); }
});

test('live interface validation rejects legacy address-only enrollment and missing payment authorization arguments', () => {
  for (const name of Object.keys(CORE_INTERFACE) as (keyof typeof CORE_INTERFACE)[]) assert.doesNotThrow(() => assertContractInterface(name, normalizedFixture(name), a(1), a(6)));
  const old = normalizedFixture('register_user'); old.parameters[2] = 'Address';
  assert.throws(() => assertContractInterface('register_user', old, a(1), a(6)), /MemWalAccount/);
  const payment = normalizedFixture('settle_split_share'); payment.parameters.splice(0, 2);
  assert.throws(() => assertContractInterface('settle_split_share', payment, a(1), a(6)), /interface mismatch/);
  assert.throws(() => assertContractInterface('register_user', normalizedFixture('register_user'), a(1), a(99)), /MemWalAccount/);
  const registryPayment = normalizedFixture('settle_split_share');
  registryPayment.parameters[0] = { Reference: { Struct: { address: a(1), module: 'core', name: 'SolvencyRegistry', typeArguments: [] } } };
  assert.throws(() => assertContractInterface('settle_split_share', registryPayment, a(1), a(6)), /UserProfile/);
  const mutablePayment = normalizedFixture('settle_split_share');
  mutablePayment.parameters[0] = { MutableReference: (mutablePayment.parameters[0] as { Reference: import('@mysten/sui/jsonRpc').SuiMoveNormalizedType }).Reference };
  assert.throws(() => assertContractInterface('settle_split_share', mutablePayment, a(1), a(6)), /mutability mismatch/);
  const badContacts = normalizedFixture('register_user'); badContacts.parameters[5] = { Vector: 'Address' };
  assert.throws(() => assertContractInterface('register_user', badContacts, a(1), a(6)), /type or mutability mismatch/);
});
