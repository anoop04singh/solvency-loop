import { CATEGORIES, contractConfig, getWalletNamespace, SUI_MAINNET_USDC_TYPE } from './config';
import { requireWalletMemoryAccess } from './memwal-account';
import { createScopedMemWalClient } from './walrus-tatum-memory';
import { fetchFullUserStateViaTatum } from './onchain-user-manager';
import { tatumSuiClient } from './tatum-rpc-client';
import type { MemoryPayload, RecalledMemory } from './memory-protocol';
import type { SolvencyNamespaceCategory } from './config';
import { CHECKIN_DELAY_MS, DAY_MS, localHour, purchaseMemories, type PurchaseMemory, type RegretMemory, type CashflowMemory } from './financial-insights';
import { usdcToUnits } from './money';
import { verifyRecalledSettlements } from './memory-evidence';
import type {MemoryResponse} from './memory-api';
import {parseBillDraft} from './bill-draft';
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
export async function executeMemoryRequest(p: MemoryPayload, nonce: string, deps?: MemoryDependencies):Promise<MemoryResponse> {
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
  const recallAll = async (committed: RecalledMemory[] = []) => {
    const results = await Promise.all(CATEGORIES.map(async cat => {
      const queries={social_split_trust:'SOLVENCY_RULE_V1 SOLVENCY_SETTLEMENT_V1 alcohol exclusions payment preferences settlement history',habit_regret:'SOLVENCY_PURCHASE_V1 SOLVENCY_REGRET_V1 purchase check-in regret reflections',cashflow_elasticity:'SOLVENCY_CASHFLOW_V1 balance liquidity cashflow local time regret'};
      const recalled = await scopedClient(cat).recall({ query: p.query || queries[cat], topK: 100 });
      if (recalled.dropped_count) throw new Error('Some Walrus memories could not be decrypted. Restore the namespace before relying on its rules.');
      return recalled.results.map(m => ({ ...m, namespace: getWalletNamespace(wallet, cat), category: cat }));
    }));
    const memories=[...new Map([...results.flat(),...committed].map(m=>[m.namespace+':'+m.blob_id,m])).values()];
    return { memories, ...(await verifyRecalledSettlements(memories,wallet,deps)), tatumAnchor: anchor };
  };
  if (p.action === 'recall_all') return recallAll();
  const client = scopedClient(category);
  if (p.action === 'save_preference') {
    if (!state.contacts.some(c => c.walletAddress === p.subjectWallet)) throw new Error('Save this person as a contact before setting a payment preference.');
    const text = 'My payment preference. SOLVENCY_RULE_V1 ' + JSON.stringify({ subject: p.subjectWallet, upfrontAboveUsdc: p.upfrontAboveUsdc, excludeAlcohol:p.excludeAlcohol===true, fundingPolicy:p.fundingPolicy||'always', updatedAtMs: Date.now() });
    const committed = await scopedClient('social_split_trust').rememberAndWait(text, { timeoutMs: 60_000, idempotencyKey: 'preference:' + nonce });
    if(!committed.blob_id)throw new Error('The preference did not return a committed Walrus blob.');
    return { status: 'COMMITTED', committed, createdMemories:[{blob_id:committed.blob_id,text,namespace:getWalletNamespace(wallet,'social_split_trust'),category:'social_split_trust' as const}], tatumAnchor: anchor };
  }
  if (p.action === 'remember') {
    const committed = await client.rememberAndWait(p.text + ' | [Tatum checkpoint #' + state.latestCheckpoint + ']', { timeoutMs: 60_000, idempotencyKey: 'reflection:' + nonce });
    return { status: 'COMMITTED', committed, tatumAnchor: anchor };
  }
  if (p.action === 'analyze') {
    const result = await client.analyzeAndWait(p.text!, undefined, { timeoutMs: 90_000 });
    return { status: 'COMMITTED', result:{...result,truncated:undefined}, tatumAnchor: anchor };
  }
  if (p.action === 'restore') {
    const result = await client.restore(getWalletNamespace(wallet, category), 20);
    if (result.failed) throw new Error(result.failed + ' memories could not be restored; no complete recovery is claimed.');
    return { status: result.truncated ? 'MORE_TO_RESTORE' : 'RESTORED', result, tatumAnchor: anchor };
  }
  if(p.action==='record_purchase'){
    const now=Date.now(),purchasedAtMs=p.purchasedAtMs!;
    if(purchasedAtMs>now||purchasedAtMs<now-365*DAY_MS)throw new Error('Track a purchase from the past year, not a future purchase.');
    const record:PurchaseMemory={id:nonce,owner:wallet,merchant:p.merchant!.trim(),category:p.merchantCategory!,amountUnits:usdcToUnits(p.amountUsdc!).toString(),purchasedAtMs,timeZone:p.timeZone!,localHour:localHour(purchasedAtMs,p.timeZone!),recordedAtMs:now,checkpoint:state.latestCheckpoint,balanceUnits:usdcToUnits(state.usdcBalance).toString()};
    const text='Self-reported USDC purchase. SOLVENCY_PURCHASE_V1 '+JSON.stringify(record);
    const committed=await scopedClient('habit_regret').rememberAndWait(text,{timeoutMs:60_000,idempotencyKey:'purchase:'+nonce,dedupe:true});
    if(!committed.blob_id)throw new Error('The purchase memory did not return a committed Walrus blob.');
    return {status:'COMMITTED',purchaseId:nonce,createdMemories:[{blob_id:committed.blob_id,text,namespace:getWalletNamespace(wallet,'habit_regret'),category:'habit_regret' as const}],tatumAnchor:anchor};
  }
  if(p.action==='regret_checkin'){
    const recalled=await scopedClient('habit_regret').recall({query:'SOLVENCY_PURCHASE_V1 '+p.purchaseId,topK:100});
    if(recalled.dropped_count)throw new Error('Some purchase memories could not be decrypted. Restore the namespace first.');
    const purchase=purchaseMemories(recalled.results.map(memory=>({...memory,namespace:getWalletNamespace(wallet,'habit_regret'),category:'habit_regret' as const})),wallet).find(record=>record.id===p.purchaseId);
    if(!purchase)throw new Error('This tracked purchase could not be found in your memory account. Recall or restore it before rating.');
    const now=Date.now();if(now<purchase.purchasedAtMs+CHECKIN_DELAY_MS)throw new Error('The 48-hour check-in is not due yet.');
    const rating:RegretMemory={...purchase,verdict:p.verdict!,intensity:p.verdict==='regretted'?p.intensity!:0,checkedAtMs:now,checkpoint:state.latestCheckpoint,balanceUnits:usdcToUnits(state.usdcBalance).toString()};
    const cashflow:CashflowMemory={purchaseId:purchase.id,owner:wallet,localHour:purchase.localHour,regretScore:rating.intensity,balanceUnits:rating.balanceUnits,floorUnits:usdcToUnits(state.safeFloorUsdc).toString(),checkedAtMs:now,checkpoint:state.latestCheckpoint};
    const text='48-hour purchase check-in. SOLVENCY_REGRET_V1 '+JSON.stringify(rating),cashflowText='Live balance context for check-in. SOLVENCY_CASHFLOW_V1 '+JSON.stringify(cashflow);
    const first=await scopedClient('habit_regret').rememberAndWait(text,{timeoutMs:60_000,idempotencyKey:'regret:'+nonce,dedupe:true});
    if(!first.blob_id)throw new Error('The check-in did not return a committed Walrus blob.');
    let second;
    try{second=await scopedClient('cashflow_elasticity').rememberAndWait(cashflowText,{timeoutMs:60_000,idempotencyKey:'cashflow:'+nonce,dedupe:true});if(!second.blob_id)throw new Error('Missing cash-flow blob.');}
    catch{throw new Error('Your check-in was saved, but its cash-flow context could not finish. Retry the check-in; repeated ratings are counted only once per purchase.');}
    return {status:'COMMITTED',createdMemories:[{blob_id:first.blob_id,text,namespace:getWalletNamespace(wallet,'habit_regret'),category:'habit_regret' as const},{blob_id:second.blob_id,text:cashflowText,namespace:getWalletNamespace(wallet,'cashflow_elasticity'),category:'cashflow_elasticity' as const}],tatumAnchor:anchor};
  }
  if (p.action === 'settlement' || p.action === 'sync_settlements' || p.action === 'refresh_learning' || p.action === 'smart_split') {
    const draft=p.action==='smart_split'?parseBillDraft(p.text!,state.contacts,wallet):undefined;
    const { packageId } = contractConfig();
    const createdMemories: RecalledMemory[] = [];
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
        const fact = 'Verified on-chain settlement. SOLVENCY_SETTLEMENT_V1 ' + JSON.stringify({ subject: e.payer, recipient: e.recipient, amountUnits: e.amount, lagMs: settled - created, createdAtMs:created, settledAtMs:settled, eventSeq:event.id.eventSeq, digest, splitId: e.split_id, checkpoint: tx.checkpoint });
        // A signature authorizes writes only to this owner's account. Recipients import their own history.
        const committed = await scopedClient('social_split_trust').rememberAndWait(fact, { timeoutMs: 60_000, idempotencyKey: 'settlement:' + digest + ':' + event.id.eventSeq + ':' + wallet, dedupe: true });
        if (!committed.blob_id) throw new Error('The settlement did not return a committed Walrus blob. Retry its memory update without paying again.');
        createdMemories.push({blob_id:committed.blob_id,text:fact,namespace:getWalletNamespace(wallet,'social_split_trust'),category:'social_split_trust' as const});
        count++;
      }
      return count;
    };
    if (p.action === 'settlement') {
      const count = await rememberTransaction(p.digest!);
      if (!count) throw new Error('No matching settlement events for the signing wallet.');
      return { status: 'COMMITTED', count, createdMemories, tatumAnchor: anchor };
    }
    let cursor=p.cursor, count=0, scanned=0, nextCursor:typeof p.cursor|null=null;
    const cursors=new Set<string>();
    for(let pageIndex=0;pageIndex<(['refresh_learning','smart_split'].includes(p.action)?4:1);pageIndex++){
      const page=await deps.events({query:{MoveEventType:packageId+'::core::ShareSettledEvent'},cursor,limit:5,order:'descending'});
      const key=page.nextCursor?JSON.stringify(page.nextCursor):'';
      if(page.hasNextPage&&(!page.nextCursor||cursors.has(key)||(page.nextCursor.txDigest===cursor?.txDigest&&page.nextCursor.eventSeq===cursor?.eventSeq)))throw new Error('Settlement history pagination did not advance.');
      cursors.add(key);scanned+=page.data.length;
      const ids=new Set(page.data.map(e=>e.id.txDigest+':'+e.id.eventSeq));
      const digests=new Set(page.data.filter(event=>{
        const e=event.parsedJson as {payer?:string;recipient?:string};
        return e.payer?.toLowerCase()===wallet||e.recipient?.toLowerCase()===wallet;
      }).map(e=>e.id.txDigest));
      for(const digest of digests)count+=await rememberTransaction(digest,ids);
      nextCursor=page.hasNextPage?page.nextCursor:null;
      if(!nextCursor)break;
      cursor=nextCursor;
    }
    return {status:'COMMITTED',count,scanned,createdMemories,nextCursor,...(draft?{draft}:{}),...(['refresh_learning','smart_split'].includes(p.action)?await recallAll(createdMemories):{tatumAnchor:anchor})};
  }
  throw new Error('Unsupported action.');
}
