import type { CORE_INTERFACE } from '../../src/lib/contract-interface';
import type { SuiMoveNormalizedFunction, SuiMoveNormalizedType as Type } from '@mysten/sui/jsonRpc';

// Independent ABI fixture: do not derive parameter shapes from the validator.
export function normalizedFixture(name: keyof typeof CORE_INTERFACE, packageId: string, memwalPackageId: string): SuiMoveNormalizedFunction {
  const object = (address: string, module: string, name: string, typeArguments: Type[] = []): Type => ({ Struct: { address, module, name, typeArguments } });
  const ref = (type: Type): Type => ({ Reference: type }), mut = (type: Type): Type => ({ MutableReference: type });
  const profile = object(packageId, 'core', 'UserProfile'), registry = object(packageId, 'core', 'SolvencyRegistry');
  const memory = ref(object(memwalPackageId, 'account', 'MemWalAccount'));
  const text = object('0x1', 'string', 'String'), clock = ref(object('0x2', 'clock', 'Clock'));
  const t: Type = { TypeParameter: 0 }, coin = object('0x2', 'coin', 'Coin', [t]);
  const split = mut(object(packageId, 'core', 'GroupSplitEscrow', [t]));
  const parameters: Record<keyof typeof CORE_INTERFACE, Type[]> = {
    register_user: [mut(registry), text, memory, 'U64', { Vector: 'Address' }, { Vector: text }, clock],
    update_profile: [mut(profile), text, memory, 'U64'],
    add_contact: [mut(profile), memory, 'Address', text],
    remove_contact: [mut(profile), memory, 'Address'],
    create_group_split: [ref(profile), memory, text, 'U64', { Vector: 'Address' }, { Vector: 'U64' }, { Vector: 'Bool' }, clock],
    fund_split_share: [ref(profile), memory, split, coin, clock],
    settle_split_share: [ref(profile), memory, split, coin, clock],
    activate_group_split: [ref(profile), memory, split, clock],
    cancel_group_split: [ref(profile), memory, split],
    refund_escrow: [ref(profile), memory, split, clock],
    lock_in_cooldown_vault: [ref(profile), memory, coin, coin, text, clock],
    unlock_cooldown_vault: [ref(profile), memory, object(packageId, 'core', 'CooldownVault', [t]), clock],
  };
  const generic = !['register_user', 'update_profile', 'add_contact', 'remove_contact'].includes(name);
  return { visibility: 'Public', isEntry: false, typeParameters: generic ? [{ abilities: [] }] : [], parameters: [...parameters[name], mut(object('0x2', 'tx_context', 'TxContext'))], return: [] };
}

export function profileLayoutFixture(): import('@mysten/sui/jsonRpc').SuiMoveNormalizedStruct {
  const object = (address: string, module: string, name: string, typeArguments: Type[] = []): Type => ({ Struct: { address, module, name, typeArguments } });
  const text = object('0x1', 'string', 'String');
  return { abilities: { abilities: ['Key'] }, typeParameters: [], fields: [
    { name: 'id', type: object('0x2', 'object', 'UID') }, { name: 'wallet', type: 'Address' },
    { name: 'handle', type: text }, { name: 'memwal_account_id', type: 'Address' }, { name: 'safe_floor_usdc', type: 'U64' },
    { name: 'contacts', type: object('0x2', 'vec_map', 'VecMap', ['Address', text]) }, { name: 'registered_at_ms', type: 'U64' },
  ] };
}
