import { CATEGORIES, contractConfig, getWalletNamespace, publicConfig, SUI_MAINNET_USDC_TYPE } from './config';
import { createScopedMemWalClient } from './walrus-tatum-memory';
import { fetchFullUserStateViaTatum } from './onchain-user-manager';
import { tatumSuiClient } from './tatum-rpc-client';
import type { MemoryPayload } from './memory-protocol';
import type { SolvencyNamespaceCategory } from './config';
type MemoryClient = ReturnType<typeof createScopedMemWalClient>;
export interface MemoryDependencies {
  client: (wallet: string, category: SolvencyNamespaceCategory) => Pick<MemoryClient, 'recall' | 'rememberAndWait' | 'analyzeAndWait' | 'restore'>;
  state: typeof fetchFullUserStateViaTatum;
  transaction: typeof tatumSuiClient.getTransactionBlock;
  object: typeof tatumSuiClient.getObject;
}
const defaults: MemoryDependencies = { client: createScopedMemWalClient, state: fetchFullUserStateViaTatum,
  transaction: p => tatumSuiClient.getTransactionBlock(p), object: p => tatumSuiClient.getObject(p) };
export function seedFacts(p: MemoryPayload): { category: SolvencyNamespaceCategory; text: string }[] {
  const f = p.friendWallets!;
  return [
    { category: 'social_split_trust', text: 'Demo rule: Alex avoids alcohol. SOLVENCY_RULE_V1 ' + JSON.stringify({ subject: f.alex.toLowerCase(), excludeAlcohol: true }) },
    { category: 'social_split_trust', text: 'Demo rule: Sam must fund shares above 40 USDC upfront. SOLVENCY_RULE_V1 ' + JSON.stringify({ subject: f.sam.toLowerCase(), upfrontAboveUsdc: 40 }) },
    { category: 'social_split_trust', text: 'Demo preference: use equal food shares unless a receipt says otherwise.' },
    { category: 'social_split_trust', text: 'Demo preference: shared utility costs may be proposed at 50/30/20; confirm before creating a bill.' },
    { category: 'social_split_trust', text: 'Demo note: settlement speed must be learned from confirmed on-chain events, not assumed for Priya (' + f.priya + ').' },
    { category: 'habit_regret', text: 'Demo reflection: pause late-night food delivery purchases for review.' },
    { category: 'habit_regret', text: 'Demo preference: review electronics purchases above 80 USDC after 24 hours.' },
    { category: 'habit_regret', text: 'Demo preference: review SaaS trial renewals 48 hours before billing.' },
    { category: 'habit_regret', text: 'Demo reflection: productive weekend coworking expenses may be worthwhile.' },
    { category: 'cashflow_elasticity', text: 'Demo preference: preserve the liquidity floor recorded in my Sui profile.' },
    { category: 'cashflow_elasticity', text: 'Demo preference: reduce discretionary sweeps near month end.' },
    { category: 'cashflow_elasticity', text: 'Demo preference: reassess daily spending after income arrives.' },
  ];
}
export async function executeMemoryRequest(p: MemoryPayload, nonce: string, deps?: MemoryDependencies) {
  if (deps) return executeRequestWithDeps(p, nonce, deps);
  const pool = new Map<string, MemoryClient>();
  const scoped = { ...defaults, client: (wallet: string, category: SolvencyNamespaceCategory) => {
    const key = wallet + ':' + category;
    let client = pool.get(key);
    if (!client) { client = createScopedMemWalClient(wallet, category); pool.set(key, client); }
    return client;
  } };
  try { return await executeRequestWithDeps(p, nonce, scoped); }
  finally { for (const client of pool.values()) client.destroy(); }
}
async function executeRequestWithDeps(p: MemoryPayload, nonce: string, deps: MemoryDependencies) {
  const wallet = p.walletAddress.toLowerCase(), category = p.category || 'social_split_trust';
  const state = await deps.state(wallet); // Live checkpoint anchors every operation.
  if (!state.isRegisteredOnChain && p.action !== 'settlement') throw new Error('Register your on-chain profile first.');
  if (p.action !== 'settlement' && state.memwalAccountId.toLowerCase() !== publicConfig().memwalAccountId.toLowerCase()) throw new Error('Your profile references a different MemWal account. Update the on-chain profile first.');
  const anchor = { checkpoint: state.latestCheckpoint, gateway: 'https://sui-mainnet.gateway.tatum.io', usdcBalance: state.usdcBalance };
  if (p.action === 'recall_all') {
    const results = await Promise.all(CATEGORIES.map(async cat => {
      const recalled = await deps.client(wallet, cat).recall({ query: p.query || 'SOLVENCY_RULE_V1 SOLVENCY_SETTLEMENT_V1 alcohol escrow settlement liquidity regret preferences', topK: 100 });
      if (recalled.dropped_count) throw new Error('Some Walrus memories could not be decrypted. Restore the namespace before relying on its rules.');
      return recalled.results.map(m => ({ ...m, namespace: getWalletNamespace(wallet, cat), category: cat }));
    }));
    return { memories: results.flat(), tatumAnchor: anchor };
  }
  const client = deps.client(wallet, category);
  if (p.action === 'remember') {
    const committed = await client.rememberAndWait(p.text + ' | [Tatum checkpoint #' + state.latestCheckpoint + ']', { timeoutMs: 60_000, idempotencyKey: 'reflection:' + nonce });
    return { status: 'COMMITTED', committed, tatumAnchor: anchor };
  }
  if (p.action === 'analyze') {
    const result = await client.analyzeAndWait(p.text!, undefined, { timeoutMs: 90_000 });
    return { status: 'COMMITTED', result, tatumAnchor: anchor };
  }
  if (p.action === 'restore') {
    const result = await client.restore(getWalletNamespace(wallet, category), 20);
    if (result.failed) throw new Error(result.failed + ' memories could not be restored; no complete recovery is claimed.');
    return { status: result.truncated ? 'MORE_TO_RESTORE' : 'RESTORED', result, tatumAnchor: anchor };
  }
  if (p.action === 'seed_12_mainnet') {
    const dataset = seedFacts(p), blobs: string[] = [];
    for (let i = 0; i < dataset.length; i += 3) {
      const batch = await Promise.all(dataset.slice(i, i + 3).map(async (item, offset) => {
        const result = await deps.client(wallet, item.category).rememberAndWait(item.text + ' | [Tatum checkpoint #' + state.latestCheckpoint + ']', { timeoutMs: 90_000, idempotencyKey: 'demo:' + nonce + ':' + (i + offset) });
        return result.blob_id;
      }));
      blobs.push(...batch);
    }
    return { status: 'COMMITTED', count: blobs.length, blobIds: blobs, tatumAnchor: anchor };
  }
  if (p.action === 'settlement') {
    const { packageId } = contractConfig();
    const tx = await deps.transaction({ digest: p.digest!, options: { showEffects: true, showEvents: true } });
    if (tx.effects?.status.status !== 'success') throw new Error('Only a successful on-chain settlement can be remembered.');
    const events = (tx.events || []).filter(e => e.type === packageId + '::core::ShareSettledEvent');
    let count = 0;
    for (const event of events) {
      const e = event.parsedJson as { payer: string; recipient: string; split_id: string; amount: string; settled_at_ms: string };
      if (e.payer !== wallet && e.recipient !== wallet) continue;
      const split = await deps.object({ id: e.split_id, options: { showContent: true } });
      if (split.data?.content?.dataType !== 'moveObject' || split.data.content.type !== packageId + '::core::GroupSplitEscrow<' + SUI_MAINNET_USDC_TYPE + '>') throw new Error('Settlement split type could not be verified.');
      const created = Number((split.data.content.fields as Record<string, unknown>).created_at_ms), settled = Number(e.settled_at_ms);
      if (!Number.isSafeInteger(created) || !Number.isSafeInteger(settled) || settled < created) throw new Error('Invalid settlement timestamps.');
      const fact = 'Verified on-chain settlement. SOLVENCY_SETTLEMENT_V1 ' + JSON.stringify({ subject: e.payer, recipient: e.recipient, amountUnits: e.amount, lagMs: settled - created, digest: p.digest, splitId: e.split_id, checkpoint: tx.checkpoint });
      // Trust learning belongs to the creator as well as the paying wallet.
      for (const owner of new Set([e.payer, e.recipient])) {
        await deps.client(owner, 'social_split_trust').rememberAndWait(fact, { timeoutMs: 60_000, idempotencyKey: 'settlement:' + p.digest + ':' + e.payer + ':' + owner });
        count++;
      }
    }
    if (!count) throw new Error('No matching settlement events for the signing wallet.');
    return { status: 'COMMITTED', count, tatumAnchor: anchor };
  }
  throw new Error('Unsupported action.');
}
