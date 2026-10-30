// Server/CLI module. Never import this module into a client component.
import { MemWal } from '@mysten-incubation/memwal';
import { MemWalManual } from '@mysten-incubation/memwal/manual';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { getWalletNamespace, memwalConfig, requireAddress, type SolvencyNamespaceCategory } from './config';
import { tatumSuiClient } from './tatum-rpc-client';
export { getWalletNamespace, type SolvencyNamespaceCategory } from './config';
export function delegateKeypair() {
  const key = process.env.MEMWAL_DELEGATE_PRIVATE_KEY;
  if (!key) throw new Error('MEMWAL_DELEGATE_PRIVATE_KEY is not configured.');
  return Ed25519Keypair.fromSecretKey(key.startsWith('suiprivkey') ? key : fromHex(key.replace(/^0x/, '')));
}
export function createScopedMemWalClient(walletAddress: string, category: SolvencyNamespaceCategory, accountId: string) {
  if (typeof window !== 'undefined') throw new Error('MemWal delegate credentials must remain on the server.');
  const key = process.env.MEMWAL_DELEGATE_PRIVATE_KEY;
  if (!key) throw new Error('MEMWAL_DELEGATE_PRIVATE_KEY is not configured.');
  const client = MemWal.create({ key, accountId: requireAddress(accountId, 'Wallet-owned MemWal account ID'),
    serverUrl: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
    namespace: getWalletNamespace(walletAddress, category), suiClient: tatumSuiClient, requestTimeoutMs: 25_000 });
  if ((client as unknown as { solvencySuiClient?: unknown }).solvencySuiClient !== tatumSuiClient) {
    client.destroy(); throw new Error('MemWal transport patch is missing. Run npm ci with lifecycle scripts enabled.');
  }
  return client;
}
// Optional advanced server-side manual mode. No private key uses NEXT_PUBLIC_*.
export function createTatumBackedManualMemWal(walletAddress: string, category: SolvencyNamespaceCategory, accountId: string) {
  if (typeof window !== 'undefined') throw new Error('Manual MemWal is server-only.');
  if (!process.env.MEMWAL_DELEGATE_PRIVATE_KEY || !process.env.OPENAI_API_KEY) throw new Error('Manual mode requires server-side delegate and embedding credentials.');
  const config = memwalConfig();
  return MemWalManual.create({ key: process.env.MEMWAL_DELEGATE_PRIVATE_KEY, suiPrivateKey: delegateKeypair().getSecretKey(),
    accountId: requireAddress(accountId), packageId: config.packageId, registryId: config.registryId,
    embeddingApiKey: process.env.OPENAI_API_KEY, suiNetwork: 'mainnet', suiClient: tatumSuiClient,
    serverUrl: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz', namespace: getWalletNamespace(walletAddress, category) });
}
