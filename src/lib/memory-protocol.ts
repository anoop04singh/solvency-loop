import { usdcToUnits } from './money';
import { CATEGORIES, requireAddress, type SolvencyNamespaceCategory } from './config';
import { MERCHANT_CATEGORIES, type MerchantCategory } from './financial-insights';
import type {MemoryDelegation} from './memory-session-protocol';
import {isLearningChoice,MAX_EXCHANGE_CHARS,MAX_RECENT_EXCHANGES,type AgentExchange,type LearningChoice} from './agent-learning';
import {isSplitContinuation,type SplitContinuation} from './split-continuation';
export type MemoryAction = 'recall_all' | 'recall_learning' | 'refresh_learning' | 'smart_split' | 'agent_chat' | 'agent_status' | 'remember' | 'analyze' | 'restore' | 'save_preference' | 'edit_learning' | 'settlement' | 'sync_settlements' | 'record_purchase' | 'regret_checkin';
export interface SettlementCursor { txDigest: string; eventSeq: string; cursor?: string; }
export interface MemoryPayload {
  action: MemoryAction; walletAddress: string; category?: SolvencyNamespaceCategory; text?: string; query?: string;
  subjectWallet?: string; upfrontAboveUsdc?: number; digest?: string; cursor?: SettlementCursor;
  excludeAlcohol?:boolean; fundingPolicy?:'always'|'adaptive'|'never';
  merchant?:string; merchantCategory?:MerchantCategory; amountUsdc?:string; purchasedAtMs?:number; timeZone?:string;
  purchaseId?:string; splitId?:string; verdict?:'regretted'|'worth_it'; intensity?:number;
  threadId?:string;
  conversation?:AgentExchange[];
  pendingSplit?:SplitContinuation;
  learningChoice?:LearningChoice;
  sessionAccountId?:string;
  autoExecute?:boolean;autoMemory?:boolean;requestId?:string;
  incomingSplitId?:string;incomingOperation?:'pay'|'activate';
  allowanceEpoch?:string;
}
export interface MemoryEnvelope { payload: MemoryPayload; issuedAt: number; nonce: string; origin: string; signature: string; delegation?:MemoryDelegation; }
export interface RecalledMemory { blob_id: string; text: string; distance?: number; namespace: string; category: SolvencyNamespaceCategory; created_at?: string; }
export function validatePayload(value: unknown): MemoryPayload {
  if (!value || typeof value !== 'object') throw new Error('A memory request is required.');
  const p = value as MemoryPayload;
  requireAddress(p.walletAddress);
  if(p.sessionAccountId!==undefined)requireAddress(p.sessionAccountId,'Session account');
  if (!['recall_all', 'recall_learning', 'refresh_learning', 'smart_split', 'agent_chat','agent_status', 'remember', 'analyze', 'restore', 'save_preference', 'edit_learning', 'settlement', 'sync_settlements', 'record_purchase', 'regret_checkin'].includes(p.action)) throw new Error('Unsupported memory action.');
  if(p.action==='edit_learning'&&!isLearningChoice(p.learningChoice))throw new Error('Choose a valid learned preference.');
  for(const flag of [p.autoExecute,p.autoMemory])if(flag!==undefined&&typeof flag!=='boolean')throw Error('Invalid agent permission flag.');
  if(p.autoExecute&&(typeof p.allowanceEpoch!=='string'||!/^\d{1,20}$/.test(p.allowanceEpoch)||BigInt(p.allowanceEpoch)>18446744073709551615n))throw Error('The signed command must identify its allowance policy version.');
  if(p.incomingSplitId!==undefined){requireAddress(p.incomingSplitId,'Incoming bill');if(p.action!=='agent_chat'||!['pay','activate'].includes(String(p.incomingOperation)))throw Error('Invalid scoped incoming action.');}
  if(p.action==='agent_status'&&(typeof p.requestId!=='string'||!/^[a-f0-9]{64}$/.test(p.requestId)))throw Error('A valid agent receipt request ID is required.');
  if (p.category !== undefined && !CATEGORIES.includes(p.category)) throw new Error('Invalid category.');
  for (const field of [p.text, p.query]) if (field !== undefined && (typeof field !== 'string' || !field.trim() || field.length > 8000)) throw new Error('Memory text/query must contain 1–8000 characters.');
  if (['remember', 'analyze','smart_split'].includes(p.action) && !p.text?.trim()) throw new Error('Memory text is required.');
  if(p.action==='agent_chat'){
    if(p.pendingSplit!==undefined&&(p.autoExecute||!isSplitContinuation(p.pendingSplit)))throw Error('The pending split is invalid. Start a new reviewed split.');
    if(typeof p.text!=='string'||!p.text.trim()||p.text.length>4000||typeof p.threadId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(p.threadId))throw new Error('A message and valid conversation ID are required.');
    if(typeof p.timeZone!=='string'||p.timeZone.length>80)throw new Error('A valid time zone is required.');
    try{new Intl.DateTimeFormat('en-US',{timeZone:p.timeZone});}catch{throw new Error('A valid time zone is required.');}
    const secret=/suiprivkey1|\bAIza[0-9A-Za-z_-]{30,}\b/;
    if(secret.test(p.text))throw new Error('Keep private keys and API keys out of chat. Configure secrets only on the server.');
    if(p.conversation!==undefined&&(!Array.isArray(p.conversation)||p.conversation.length>MAX_RECENT_EXCHANGES||p.conversation.some(turn=>!turn||[turn.user,turn.reply].some(value=>typeof value!=='string'||value.length>MAX_EXCHANGE_CHARS||secret.test(value)))))throw new Error('Recent chat context is invalid. Start a new chat.');
  }
  if (p.action === 'save_preference') {
    requireAddress(p.subjectWallet, 'Contact wallet');
    if (p.subjectWallet === p.walletAddress || typeof p.upfrontAboveUsdc !== 'number') throw new Error('Choose a contact and an upfront funding threshold.');
    usdcToUnits(p.upfrontAboveUsdc);
    if(p.excludeAlcohol!==undefined&&typeof p.excludeAlcohol!=='boolean')throw new Error('Choose a valid alcohol-sharing preference.');
    if(p.fundingPolicy!==undefined&&!['always','adaptive','never'].includes(p.fundingPolicy))throw new Error('Choose a valid funding policy.');
  }
  if(p.action==='record_purchase'){
    if(typeof p.merchant!=='string'||!p.merchant.trim()||p.merchant.length>120||!MERCHANT_CATEGORIES.includes(p.merchantCategory as MerchantCategory))throw new Error('Choose a purchase name and category.');
    if(typeof p.amountUsdc!=='string'||usdcToUnits(p.amountUsdc)<=0n)throw new Error('Enter the actual USDC purchase amount.');
    if(!Number.isSafeInteger(p.purchasedAtMs)||Number(p.purchasedAtMs)<=0)throw new Error('Choose when the purchase happened.');
    if(typeof p.timeZone!=='string'||p.timeZone.length>80)throw new Error('A valid time zone is required.');
    try{new Intl.DateTimeFormat('en-US',{timeZone:p.timeZone});}catch{throw new Error('A valid time zone is required.');}
  }
  if(p.action==='regret_checkin'){
    if(typeof p.purchaseId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(p.purchaseId)||!['regretted','worth_it'].includes(String(p.verdict)))throw new Error('Choose a tracked purchase and a rating.');
    if(p.verdict==='regretted'&&(!Number.isInteger(p.intensity)||Number(p.intensity)<1||Number(p.intensity)>5))throw new Error('Regret intensity must be between 1 and 5.');
    if(p.verdict==='worth_it'&&p.intensity!==undefined&&p.intensity!==0)throw new Error('Worth-it ratings use zero regret intensity.');
    if(p.splitId!==undefined){
      if(requireAddress(p.splitId,'Bill ID').slice(2)!==p.purchaseId)throw new Error('The check-in must identify its exact bill.');
      if(typeof p.timeZone!=='string'||p.timeZone.length>80)throw new Error('A valid time zone is required.');
      try{new Intl.DateTimeFormat('en-US',{timeZone:p.timeZone});}catch{throw new Error('A valid time zone is required.');}
    }
  }
  if (p.action === 'settlement' && (typeof p.digest !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(p.digest))) throw new Error('A valid transaction digest is required.');
  if (p.cursor !== undefined && (!['sync_settlements','refresh_learning'].includes(p.action) || !p.cursor || typeof p.cursor.txDigest !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(p.cursor.txDigest) || typeof p.cursor.eventSeq !== 'string' || !/^\d{1,20}$/.test(p.cursor.eventSeq))) throw new Error('Invalid settlement history cursor.');
  if (p.cursor?.cursor !== undefined && (typeof p.cursor.cursor !== 'string' || !p.cursor.cursor.length || p.cursor.cursor.length > 4096)) throw new Error('Invalid event page cursor.');
  return p;
}
export function memorySigningMessage(e: Omit<MemoryEnvelope, 'signature'>) {
  return 'SolvencyLoop memory request v1\nNetwork: sui:mainnet\nOrigin: ' + e.origin + '\nIssued: ' + e.issuedAt + '\nNonce: ' + e.nonce + '\nPayload: ' + JSON.stringify(e.payload)+(e.delegation?'\nDelegation: '+e.delegation.grant.nonce:'');
}
