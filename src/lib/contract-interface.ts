import type { SuiMoveNormalizedFunction, SuiMoveNormalizedStruct, SuiMoveNormalizedType } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';

// Explicit arguments only; Sui adds &mut TxContext as the final contract parameter.
export const CORE_INTERFACE = {
  register_user: { arguments: 7, memoryIndex: 2, generic: false },
  update_profile: { arguments: 4, memoryIndex: 2, generic: false },
  add_contact: { arguments: 4, memoryIndex: 1, generic: false },
  remove_contact: { arguments: 3, memoryIndex: 1, generic: false },
  create_group_split: { arguments: 8, memoryIndex: 1, generic: true },
  fund_split_share: { arguments: 5, memoryIndex: 1, generic: true },
  activate_group_split: { arguments: 4, memoryIndex: 1, generic: true },
  cancel_group_split: { arguments: 3, memoryIndex: 1, generic: true },
  refund_escrow: { arguments: 4, memoryIndex: 1, generic: true },
  settle_split_share: { arguments: 5, memoryIndex: 1, generic: true },
  lock_in_cooldown_vault: { arguments: 6, memoryIndex: 1, generic: true },
  unlock_cooldown_vault: { arguments: 4, memoryIndex: 1, generic: true },
} as const;
function referencedStruct(type: SuiMoveNormalizedType) {
  if (typeof type !== 'object') return null;
  const ref = 'Reference' in type ? type.Reference : 'MutableReference' in type ? type.MutableReference : null;
  return ref && typeof ref === 'object' && 'Struct' in ref ? ref.Struct : null;
}
function expectedParameters(name: keyof typeof CORE_INTERFACE, packageId: string, memwalPackageId: string): SuiMoveNormalizedType[] {
  const struct = (address: string, module: string, name: string, typeArguments: SuiMoveNormalizedType[] = []): SuiMoveNormalizedType => ({ Struct: { address, module, name, typeArguments } });
  const ref = (type: SuiMoveNormalizedType, mutable = false): SuiMoveNormalizedType => mutable ? { MutableReference: type } : { Reference: type };
  const profile = ref(struct(packageId, 'core', 'UserProfile'));
  const mutableProfile = ref(struct(packageId, 'core', 'UserProfile'), true);
  const memory = ref(struct(memwalPackageId, 'account', 'MemWalAccount'));
  const string = struct('0x1', 'string', 'String'), clock = ref(struct('0x2', 'clock', 'Clock'));
  const t: SuiMoveNormalizedType = { TypeParameter: 0 };
  const coin = struct('0x2', 'coin', 'Coin', [t]), split = ref(struct(packageId, 'core', 'GroupSplitEscrow', [t]), true);
  const signatures: Record<keyof typeof CORE_INTERFACE, SuiMoveNormalizedType[]> = {
    register_user: [ref(struct(packageId, 'core', 'SolvencyRegistry'), true), string, memory, 'U64', { Vector: 'Address' }, { Vector: string }, clock],
    update_profile: [mutableProfile, string, memory, 'U64'],
    add_contact: [mutableProfile, memory, 'Address', string],
    remove_contact: [mutableProfile, memory, 'Address'],
    create_group_split: [profile, memory, string, 'U64', { Vector: 'Address' }, { Vector: 'U64' }, { Vector: 'Bool' }, clock],
    fund_split_share: [profile, memory, split, coin, clock],
    activate_group_split: [profile, memory, split, clock],
    cancel_group_split: [profile, memory, split],
    refund_escrow: [profile, memory, split, clock],
    settle_split_share: [profile, memory, split, coin, clock],
    lock_in_cooldown_vault: [profile, memory, coin, coin, string, clock],
    unlock_cooldown_vault: [profile, memory, struct(packageId, 'core', 'CooldownVault', [t]), clock],
  };
  return [...signatures[name], ref(struct('0x2', 'tx_context', 'TxContext'), true)];
}
function canonicalType(type: SuiMoveNormalizedType): string {
  if (typeof type === 'string') return type;
  if ('Reference' in type) return '&' + canonicalType(type.Reference);
  if ('MutableReference' in type) return '&mut ' + canonicalType(type.MutableReference);
  if ('Vector' in type) return 'vector<' + canonicalType(type.Vector) + '>';
  if ('TypeParameter' in type) return 'T' + type.TypeParameter;
  const s = type.Struct;
  return normalizeSuiAddress(s.address) + '::' + s.module + '::' + s.name + '<' + s.typeArguments.map(canonicalType).join(',') + '>';
}
export function assertProfileLayout(profile: SuiMoveNormalizedStruct) {
  const fields = ['id', 'wallet', 'handle', 'memwal_account_id', 'safe_floor_usdc', 'contacts', 'registered_at_ms'];
  const struct = (address: string, module: string, name: string, typeArguments: SuiMoveNormalizedType[] = []): SuiMoveNormalizedType => ({ Struct: { address, module, name, typeArguments } });
  const string = struct('0x1', 'string', 'String');
  const types: SuiMoveNormalizedType[] = [struct('0x2', 'object', 'UID'), 'Address', string, 'Address', 'U64', struct('0x2', 'vec_map', 'VecMap', ['Address', string]), 'U64'];
  if (profile.abilities.abilities.length !== 1 || profile.abilities.abilities[0] !== 'Key' || profile.typeParameters.length || profile.fields.length !== fields.length || profile.fields.some((f, i) => f.name !== fields[i] || canonicalType(f.type) !== canonicalType(types[i]))) throw new Error('UserProfile must be the current non-transferable owned profile layout with only the key ability.');
}
export function assertContractInterface(name: keyof typeof CORE_INTERFACE, fn: SuiMoveNormalizedFunction, packageId: string, memwalPackageId: string) {
  const expected = CORE_INTERFACE[name], params = fn.parameters;
  if (fn.visibility !== 'Public' || params.length !== expected.arguments + 1 || fn.typeParameters.length !== (expected.generic ? 1 : 0) || fn.return.length !== 0) throw new Error('Contract interface mismatch for ' + name + '. Deploy the current SolvencyLoop package.');
  const objectName = name === 'register_user' ? 'SolvencyRegistry' : 'UserProfile';
  const object = referencedStruct(params[0]);
  if (!object || normalizeSuiAddress(object.address) !== normalizeSuiAddress(packageId) || object.module !== 'core' || object.name !== objectName) throw new Error('Missing ' + objectName + ' authorization argument in ' + name);
  const memory = referencedStruct(params[expected.memoryIndex]);
  if (!memory || normalizeSuiAddress(memory.address) !== normalizeSuiAddress(memwalPackageId) || memory.module !== 'account' || memory.name !== 'MemWalAccount') throw new Error('Missing wallet-owned MemWalAccount argument in ' + name);
  const context = referencedStruct(params[params.length - 1]);
  if (!context || normalizeSuiAddress(context.address) !== normalizeSuiAddress('0x2') || context.module !== 'tx_context' || context.name !== 'TxContext') throw new Error('Unexpected transaction context in ' + name);
  const types = expectedParameters(name, packageId, memwalPackageId);
  if (params.some((type, i) => canonicalType(type) !== canonicalType(types[i]))) throw new Error('Contract argument type or mutability mismatch for ' + name + '. Deploy the current object-factory package.');
}
