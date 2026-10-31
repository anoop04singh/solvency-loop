import { config } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { CATEGORIES, contractConfig, getWalletNamespace, requireAddress, SUI_MAINNET_USDC_TYPE } from '../src/lib/config';
import { createScopedMemWalClient, delegateKeypair } from '../src/lib/walrus-tatum-memory';
import { tatumSuiClient } from '../src/lib/tatum-rpc-client';
import { fetchFullUserStateViaTatum } from '../src/lib/onchain-user-manager';
import { requireWalletMemoryAccess } from '../src/lib/memwal-account';
import { assertContractInterface, assertProfileLayout, CORE_INTERFACE } from '../src/lib/contract-interface';

export async function verifyMainnetReadiness(log = console.log, options: { infrastructureOnly?: boolean } = {}) {
  const required = ['TATUM_API_KEY', 'MEMWAL_DELEGATE_PRIVATE_KEY', 'NEXT_PUBLIC_SOLVENCY_PACKAGE_ID', 'NEXT_PUBLIC_SOLVENCY_REGISTRY_ID', 'NEXT_PUBLIC_MEMWAL_AGENT_ID', 'NEXT_PUBLIC_MEMWAL_PACKAGE_ID', 'NEXT_PUBLIC_MEMWAL_REGISTRY_ID', ...(options.infrastructureOnly ? [] : ['VERIFY_WALLET_ADDRESS'])];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error('Missing configuration: ' + missing.join(', '));
  const { packageId, registryId } = contractConfig(), wallet = options.infrastructureOnly ? '' : requireAddress(process.env.VERIFY_WALLET_ADDRESS, 'Verification wallet');
  for (const key of ['NEXT_PUBLIC_MEMWAL_AGENT_ID', 'NEXT_PUBLIC_MEMWAL_PACKAGE_ID', 'NEXT_PUBLIC_MEMWAL_REGISTRY_ID']) requireAddress(process.env[key], key);
  const delegatePublicKey = '0x' + Buffer.from(delegateKeypair().getPublicKey().toRawBytes()).toString('hex');
  if (delegatePublicKey !== process.env.NEXT_PUBLIC_MEMWAL_AGENT_ID?.toLowerCase()) throw new Error('MEMWAL_AGENT_ID must match the delegate public key, not its Sui wallet address.');
  const [chain, checkpoint, registry, coin] = await Promise.all([
    tatumSuiClient.getChainIdentifier(), tatumSuiClient.getLatestCheckpointSequenceNumber(),
    tatumSuiClient.getObject({ id: registryId, options: { showContent: true, showOwner: true } }),
    tatumSuiClient.getCoinMetadata({ coinType: SUI_MAINNET_USDC_TYPE }),
  ]);
  if (chain !== '35834a8a') throw new Error('Expected Sui Mainnet chain 35834a8a; received ' + chain);
  if (!/^\d+$/.test(checkpoint)) throw new Error('Invalid checkpoint response.');
  if (registry.error || registry.data?.content?.dataType !== 'moveObject' || registry.data.content.type !== packageId + '::core::SolvencyRegistry' || !registry.data.owner || typeof registry.data.owner !== 'object' || !('Shared' in registry.data.owner)) throw new Error('Registry must be the deployed package’s shared SolvencyRegistry object.');
  if (coin?.decimals !== 6 || coin.symbol !== 'USDC') throw new Error('Circle USDC metadata verification failed.');
  assertProfileLayout(await tatumSuiClient.getNormalizedMoveStruct({ package: packageId, module: 'core', struct: 'UserProfile' }));
  for (const name of Object.keys(CORE_INTERFACE) as (keyof typeof CORE_INTERFACE)[]) {
    const fn = await tatumSuiClient.getNormalizedMoveFunction({ package: packageId, module: 'core', function: name });
    assertContractInterface(name, fn, packageId, process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID!);
  }
  log('[PASS] Authenticated Tatum Mainnet checkpoint #' + checkpoint + ', shared registry, contract functions, and Circle USDC.');
  const memwalUrl = process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz';
  if (new URL(memwalUrl).protocol !== 'https:') throw new Error('Use an HTTPS Mainnet MemWal relayer.');
  const configResponse = await fetch(memwalUrl.replace(/\/$/, '') + '/config', { signal: AbortSignal.timeout(15_000) });
  if (!configResponse.ok) throw new Error('MemWal /config returned HTTP ' + configResponse.status);
  const relayer = await configResponse.json();
  if (relayer.network !== 'mainnet' || relayer.packageId !== process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID) throw new Error('MemWal relayer network/package does not match configured Mainnet account settings.');
  if (options.infrastructureOnly) {
    const response = await fetch(memwalUrl.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('MemWal health check failed: HTTP ' + response.status);
    const health = await response.json();
    if (!['ok', 'healthy'].includes(String(health.status).toLowerCase()) || health.write_ready === false || health.mode === 'benchmark') throw new Error('MemWal is not ready for application use.');
    log('[PASS] MemWal relayer configuration and health. Infrastructure verified without wallet signing or writes.');
    return {checkpoint,memoryCount:0,chain};
  }
  const profile = await fetchFullUserStateViaTatum(wallet);
  if (!profile.isRegisteredOnChain) throw new Error('The verification wallet must have a registered on-chain profile.');
  const memoryAccount = await requireWalletMemoryAccess(wallet, profile.memwalAccountId);
  log('[PASS] Verification wallet owns its profile and active authorized MemWal account.');
  const blobs = new Set<string>();
  for (const category of CATEGORIES) {
    const client = createScopedMemWalClient(wallet, category, memoryAccount.accountId);
    try {
      const health = await client.health();
      if (!['ok', 'healthy'].includes(health.status.toLowerCase()) || health.write_ready === false || health.mode === 'benchmark') throw new Error('MemWal is unhealthy or not ready for production writes.');
      const recall = await client.recall({ query: 'SOLVENCY_RULE_V1 SOLVENCY_SETTLEMENT_V1 payment preferences reflections', topK: 100 });
      if (recall.dropped_count) throw new Error('Some recalled memories could not be decrypted.');
      for (const m of recall.results) {
        if (!m.blob_id || !m.text?.trim()) throw new Error('Invalid recalled memory.');
        blobs.add(m.blob_id);
      }
      log('[PASS] ' + getWalletNamespace(wallet, category) + ': ' + recall.results.length + ' readable Walrus memories.');
    } finally { client.destroy(); }
  }
  log('[PASS] Mainnet readiness verified: ' + blobs.size + ' unique memories recalled. No writes or transactions submitted.');
  return { checkpoint, memoryCount: blobs.size, chain };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  config({ path: '.env.local', quiet: true }); config({ quiet: true });
  verifyMainnetReadiness(console.log, { infrastructureOnly: process.argv.includes('--infrastructure-only') }).catch(error => { console.error('[FAIL]', error instanceof Error ? error.message : error); process.exitCode = 1; });
}
