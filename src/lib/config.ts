import { isValidSuiAddress } from '@mysten/sui/utils';
export const TATUM_MAINNET_GATEWAY = 'https://sui-mainnet.gateway.tatum.io';
export const SUI_MAINNET_USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export const SUI_NATIVE_TYPE = '0x2::sui::SUI';
export const COOLDOWN_MS = 86_400_000;
export const CATEGORIES = ['social_split_trust', 'habit_regret', 'cashflow_elasticity'] as const;
export type SolvencyNamespaceCategory = typeof CATEGORIES[number];
export function requireAddress(value: unknown, label = 'Sui address'): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0{64}$/.test(value) || !isValidSuiAddress(value)) throw new Error(label + ' must be a nonzero canonical Sui address (0x + 64 hex digits).');
  return value.toLowerCase();
}
export function publicConfig() {
  return { packageId: process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID || '', registryId: process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID || '',
    memwalPackageId: process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID || '', memwalRegistryId: process.env.NEXT_PUBLIC_MEMWAL_REGISTRY_ID || '',
    memwalDelegatePublicKey: process.env.NEXT_PUBLIC_MEMWAL_AGENT_ID || '' };
}
export function memwalConfig() {
  const c = publicConfig();
  return { packageId: requireAddress(c.memwalPackageId, 'MemWal package ID'), registryId: requireAddress(c.memwalRegistryId, 'MemWal registry ID'),
    delegatePublicKey: requireAddress(c.memwalDelegatePublicKey, 'MemWal delegate public key') };
}
export function contractConfig() {
  const c = publicConfig();
  return { packageId: requireAddress(c.packageId, 'Solvency package ID'), registryId: requireAddress(c.registryId, 'Solvency registry ID') };
}
export function getWalletNamespace(wallet: string, category: SolvencyNamespaceCategory) {
  if (!CATEGORIES.includes(category)) throw new Error('Unknown memory category.');
  return 'sl_' + requireAddress(wallet).slice(2) + '_' + category;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Unexpected error'; }
