import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { tatumSuiClient } from '../../src/lib/tatum-rpc-client';
import { SUI_MAINNET_USDC_TYPE } from '../../src/lib/config';
export const a = (n: number) => '0x' + n.toString(16).padStart(64, '0');
export function installOnboardingFixture() {
  const key = Ed25519Keypair.generate(), wallet = a(5), memoryId = a(3), profileId = a(20);
  const state = { registered: true, exists: true, active: true, authorized: true, wrongLink: false, coinReads: 0,
    profileOwner: wallet, profileWallet: wallet, profileType: 'UserProfile', profileUnavailable: false, directoryError: false, directoryLegacy: false,
    contacts: [] as { walletAddress: string; handle: string }[] };
  const env = { NEXT_PUBLIC_SOLVENCY_PACKAGE_ID: a(1), NEXT_PUBLIC_SOLVENCY_REGISTRY_ID: a(2), NEXT_PUBLIC_MEMWAL_PACKAGE_ID: a(6), NEXT_PUBLIC_MEMWAL_REGISTRY_ID: a(7), NEXT_PUBLIC_MEMWAL_AGENT_ID: '0x' + Buffer.from(key.getPublicKey().toRawBytes()).toString('hex') };
  const oldEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  const backup = { getObject: tatumSuiClient.getObject, getDynamicFieldObject: tatumSuiClient.getDynamicFieldObject, getAllBalances: tatumSuiClient.getAllBalances, getLatestCheckpointSequenceNumber: tatumSuiClient.getLatestCheckpointSequenceNumber, getCoins: tatumSuiClient.getCoins };
  Object.assign(tatumSuiClient, {
    getAllBalances: async () => [{ coinType: SUI_MAINNET_USDC_TYPE, totalBalance: '500000000' }],
    getLatestCheckpointSequenceNumber: async () => '123',
    getDynamicFieldObject: async ({ parentId }: { parentId: string }) => parentId === a(8)
      ? state.exists ? { data: { content: { dataType: 'moveObject', fields: { value: memoryId } } } } : { error: { code: 'dynamicFieldNotFound' } }
      : state.directoryError ? { error: { code: 'notExists' } }
      : state.registered ? { data: { content: { dataType: 'moveObject', type: '0x2::dynamic_field::Field<address, ' + (state.directoryLegacy ? a(1) + '::core::UserProfile' : '0x2::object::ID') + '>', fields: { name: wallet, value: profileId } } } } : { error: { code: 'dynamicFieldNotFound' } },
    getObject: async ({ id }: { id: string }) => {
      if (id === profileId) return state.profileUnavailable ? { error: { code: 'notExists' } } : { data: { objectId: profileId, owner: { AddressOwner: state.profileOwner }, content: { dataType: 'moveObject', type: a(1) + '::core::' + state.profileType, fields: { id: { id: profileId }, wallet: state.profileWallet, handle: 'owner', memwal_account_id: state.wrongLink ? a(9) : memoryId, safe_floor_usdc: '300000000', contacts: { fields: { contents: state.contacts.map(c => ({ fields: { key: c.walletAddress, value: c.handle } })) } } } } } };
      return { data: { objectId: id, owner: { Shared: { initial_shared_version: '1' } }, content: { dataType: 'moveObject', type: id === a(2) ? a(1) + '::core::SolvencyRegistry' : a(6) + (id === a(7) ? '::account::AccountRegistry' : '::account::MemWalAccount'), fields: id === a(7) ? { accounts: { fields: { id: { id: a(8) } } } } : { owner: wallet, active: state.active, delegate_keys: state.authorized ? [{ fields: { public_key: Array.from(key.getPublicKey().toRawBytes()), sui_address: key.toSuiAddress() } }] : [] } } } };
    },
    getCoins: async ({ coinType }: { coinType: string }) => { if (coinType !== SUI_MAINNET_USDC_TYPE) throw new Error('Alternate coin requested'); state.coinReads++; return { data: [{ coinObjectId: a(10), balance: '500000000' }], hasNextPage: false }; },
  });
  return { wallet, memoryId, profileId, state, restore() { Object.assign(tatumSuiClient, backup); for (const [k, v] of Object.entries(oldEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}
