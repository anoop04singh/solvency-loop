import { CATEGORIES, contractConfig, getWalletNamespace, SUI_MAINNET_USDC_TYPE } from './config';
import { requireWalletMemoryAccess } from './memwal-account';
import { createScopedMemWalClient } from './walrus-tatum-memory';
import { fetchFullUserStateViaTatum } from './onchain-user-manager';
import { tatumSuiClient } from './tatum-rpc-client';
import type { MemoryPayload } from './memory-protocol';
import type { SolvencyNamespaceCategory } from './config';
type MemoryClient = ReturnType<typeof createScopedMemWalClient>;
export interface MemoryDependencies {
  client: (wallet: string, category: SolvencyNamespaceCategory, accountId: string) => Pick<MemoryClient, 'recall' | 'rememberAndWait' | 'analyzeAndWait' | 'restore'>;
  access: typeof requireWalletMemoryAccess;
  state: typeof fetchFullUserStateViaTatum;
  transaction: typeof tatumSuiClient.getTransactionBlock;
  object: typeof tatumSuiClient.getObject;
  events: typeof tatumSuiClient.queryEvents;
}
const defaults: MemoryDependencies = { client: createScopedMemWalClient, state: fetchFullUserStateViaTatum,
  access: requireWalletMemoryAccess, transaction: p => tatumSuiClient.getTransactionBlock(p), object: p => tatumSuiClient.getObject(p), events: p => tatumSuiClient.queryEvents(p) };
export async function executeMemoryRequest(p: MemoryPayload, nonce: string, deps?: MemoryDependencies) {
  if (deps) return executeRequestWithDeps(p, nonce, deps);
  const pool = new Map<string, MemoryClient>();
  const scoped = { ...defaults, client: (wallet: string, category: SolvencyNamespaceCategory, accountId: string) => {
    const key = accountId + ':' + wallet + ':' + category;
    let client = pool.get(key);
    if (!client) { client = createScopedMemWalClient(wallet, category, accountId); pool.set(key, client); }
    return client;
  } };
  try { return await executeRequestWithDeps(p, nonce, scoped); }
  finally { for (const client of pool.values()) client.destroy(); }
}
async function executeRequestWithDeps(p: MemoryPayload, nonce: string, deps: MemoryDependencies) {
  const wallet = p.walletAddress.toLowerCase(), category = p.category || 'social_split_trust';
  const state = await deps.state(wallet); // Live checkpoint anchors every operation.
  if (!state.isRegisteredOnChain || !state.profileId || state.wallet !== wallet) throw new Error('Register your wallet-owned on-chain profile first.');
  const account = await deps.access(wallet, state.memwalAccountId);
  const scopedClient = (cat: SolvencyNamespaceCategory) => deps.client(wallet, cat, account.accountId);
  const anchor = { checkpoint: state.latestCheckpoint, gateway: 'https://sui-mainnet.gateway.tatum.io', usdcBalance: state.usdcBalance };
  if (p.action === 'recall_all') {
    const results = await Promise.all(CATEGORIES.map(async cat => {
      const recalled = await scopedClient(cat).recall({ query: p.query || 'SOLVENCY_RULE_V1 SOLVENCY_SETTLEMENT_V1 payment preferences settlement liquidity reflections', topK: 100 });
      if (recalled.dropped_count) throw new Error('Some Walrus memories could not be decrypted. Restore the namespace before relying on its rules.');
      return recalled.results.map(m => ({ ...m, namespace: getWalletNamespace(wallet, cat), category: cat }));
    }));
    return { memories: results.flat(), tatumAnchor: anchor };
  }
  const client = scopedClient(category);
  if (p.action === 'save_preference') {
    if (!state.contacts.some(c => c.walletAddress === p.subjectWallet)) throw new Error('Save this person as a contact before setting a payment preference.');
    const text = 'My payment preference. SOLVENCY_RULE_V1 ' + JSON.stringify({ subject: p.subjectWallet, upfrontAboveUsdc: p.upfrontAboveUsdc, updatedAtMs: Date.now() });
    const committed = await scopedClient('social_split_trust').rememberAndWait(text, { timeoutMs: 60_000, idempotencyKey: 'preference:' + nonce });
    return { status: 'COMMITTED', committed, tatumAnchor: anchor };
  }
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
  if (p.action === 'settlement' || p.action === 'sync_settlements') {
    const { packageId } = contractConfig();
    const rememberTransaction = async (digest: string, selectedEvents?: Set<string>) => {
      const tx = await deps.transaction({ digest, options: { showEffects: true, showEvents: true } });
      if (tx.effects?.status.status !== 'success') throw new Error('Only a successful on-chain settlement can be remembered.');
      const events = (tx.events || []).filter(e => e.type === packageId + '::core::ShareSettledEvent');
      let count = 0;
      for (const event of events) {
        if (selectedEvents && !selectedEvents.has(event.id.txDigest + ':' + event.id.eventSeq)) continue;
        const e = event.parsedJson as { payer: string; recipient: string; split_id: string; amount: string; settled_at_ms: string };
        if (e.payer.toLowerCase() !== wallet && e.recipient.toLowerCase() !== wallet) continue;
        if (event.id.txDigest !== digest || !/^\d+$/.test(event.id.eventSeq)) throw new Error('Settlement event identity could not be verified.');
        const split = await deps.object({ id: e.split_id, options: { showContent: true } });
        if (split.data?.content?.dataType !== 'moveObject' || split.data.content.type !== packageId + '::core::GroupSplitEscrow<' + SUI_MAINNET_USDC_TYPE + '>') throw new Error('Settlement split type could not be verified.');
        const created = Number((split.data.content.fields as Record<string, unknown>).created_at_ms), settled = Number(e.settled_at_ms);
        if (!Number.isSafeInteger(created) || !Number.isSafeInteger(settled) || settled < created) throw new Error('Invalid settlement timestamps.');
        const fact = 'Verified on-chain settlement. SOLVENCY_SETTLEMENT_V1 ' + JSON.stringify({ subject: e.payer, recipient: e.recipient, amountUnits: e.amount, lagMs: settled - created, digest, splitId: e.split_id, checkpoint: tx.checkpoint });
        // A signature authorizes writes only to this owner's account. Recipients import their own history.
        await scopedClient('social_split_trust').rememberAndWait(fact, { timeoutMs: 60_000, idempotencyKey: 'settlement:' + digest + ':' + event.id.eventSeq + ':' + wallet, dedupe: true });
        count++;
      }
      return count;
    };
    if (p.action === 'settlement') {
      const count = await rememberTransaction(p.digest!);
      if (!count) throw new Error('No matching settlement events for the signing wallet.');
      return { status: 'COMMITTED', count, tatumAnchor: anchor };
    }
    const page = await deps.events({ query: { MoveEventType: packageId + '::core::ShareSettledEvent' }, cursor: p.cursor, limit: 5, order: 'descending' });
    if (page.hasNextPage && (!page.nextCursor || (page.nextCursor.txDigest === p.cursor?.txDigest && page.nextCursor.eventSeq === p.cursor?.eventSeq))) throw new Error('Settlement history pagination did not advance.');
    const ids = new Set(page.data.map(e => e.id.txDigest + ':' + e.id.eventSeq));
    const digests = new Set(page.data.filter(event => {
      const e = event.parsedJson as { payer?: string; recipient?: string };
      return e.payer?.toLowerCase() === wallet || e.recipient?.toLowerCase() === wallet;
    }).map(e => e.id.txDigest));
    let count = 0;
    for (const digest of digests) count += await rememberTransaction(digest, ids);
    return { status: 'COMMITTED', count, nextCursor: page.hasNextPage ? page.nextCursor : null, tatumAnchor: anchor };
  }
  throw new Error('Unsupported action.');
}
