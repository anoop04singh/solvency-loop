import type {BillDraft} from './bill-draft';
import {isBillCategory} from './bill-category';
import type {computeExpense} from './expense';
import type {MemoryPayload,RecalledMemory} from './memory-protocol';
import {memoryRecord} from './financial-insights';
export const GEMINI_MODEL='gemini-3.5-flash-lite';
export class AgentReplyError extends Error {}
export type AgentAction=
 | {kind:'split';draft:BillDraft;allocation:ReturnType<typeof computeExpense>}
 | {kind:'protect';amount:string}
 | {kind:'settle';splitIds:string[];amount:string}
 | {kind:'fund';splitId:string;amount:string}
 | {kind:'activate'|'cancel'|'refund';splitId:string}
 | {kind:'unlock';vaultId:string;amount:string}
 | {kind:'memory';payload:Omit<MemoryPayload,'walletAddress'>;summary:string}
 | {kind:'contact';handle:string;walletAddress:string}
 | {kind:'none'};
export interface AgentTurn {id:string;threadId:string;owner:string;user:string;reply:string;action:AgentAction;createdAtMs:number;checkpoint:string;model:string;contextBlobIds:string[];blobId:string;source?:'user'|'autopilot';executionEligible?:boolean;}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const string=(v:unknown,max=4000):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const strings=(v:unknown,max=64):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>string(x));
const address=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
/** Shape checks also protect rendering of untrusted, user-owned recalled records. */
export function isAgentAction(v:unknown):v is AgentAction {
 if(!record(v))return false;
 if(v.kind==='none')return true;
 if(v.kind==='split'){
  const d=v.draft,a=v.allocation;
  return record(d)&&(d.category===undefined||isBillCategory(d.category))&&string(d.title,120)&&string(d.total,40)&&['equal','custom','items'].includes(String(d.mode))&&Array.isArray(d.people)&&d.people.length>0&&d.people.length<=64&&d.people.every(p=>record(p)&&string(p.id)&&string(p.handle)&&address(p.walletAddress)&&typeof p.customAmount==='string'&&typeof p.upfront==='boolean')&&Array.isArray(d.items)&&d.items.length<=30&&d.items.every(i=>record(i)&&string(i.id)&&string(i.label,80)&&['food','alcohol','other'].includes(String(i.kind))&&string(i.amount,40)&&(i.wallets===undefined||strings(i.wallets)))&&record(a)&&numeric(a.total)&&numeric(a.creatorShare)&&Array.isArray(a.shares)&&a.shares.length===d.people.length&&a.shares.every(p=>record(p)&&string(p.handle)&&address(p.walletAddress)&&numeric(p.amountUsdc)&&typeof p.requiresUpfrontEscrow==='boolean'&&typeof p.ruleApplied==='string'&&strings(p.excludedItems,30)&&record(p.history)&&numeric(p.history.count)&&(p.history.averageLagMs===null||numeric(p.history.averageLagMs)));
 }
 if(v.kind==='memory')return string(v.summary)&&record(v.payload)&&['record_purchase','regret_checkin','save_preference','remember'].includes(String(v.payload.action));
 if(v.kind==='contact')return string(v.handle,64)&&address(v.walletAddress);
 if(v.kind==='protect')return string(v.amount,40);
 if(v.kind==='settle')return strings(v.splitIds,20)&&v.splitIds.every(address)&&string(v.amount,40);
 if(v.kind==='fund')return address(v.splitId)&&string(v.amount,40);
 if(v.kind==='unlock')return address(v.vaultId)&&string(v.amount,40);
 return ['activate','cancel','refund'].includes(String(v.kind))&&address(v.splitId);
}
/** Recalled conversations are context, never authority to replay an old action. */
export function recalledAgentTurns(memories:RecalledMemory[],wallet:string,threadId?:string):AgentTurn[]{
 const unique=new Map<string,AgentTurn>();
 for(const m of memories){const r=memoryRecord(m.text,'SOLVENCY_AGENT_V1');if(!r||(!threadId&&r.source==='autopilot')||r.owner!==wallet||!string(r.id,64)||!string(r.threadId,64)||!string(r.user)||!string(r.reply)||!Number.isSafeInteger(r.createdAtMs)||Number(r.createdAtMs)<=0||!/^\d+$/.test(String(r.checkpoint))||!strings(r.contextBlobIds,60)||!string(m.blob_id)||r.model!==GEMINI_MODEL||!isAgentAction(r.action)||(threadId&&r.threadId!==threadId))continue;
  unique.set(r.id,{...r,blobId:m.blob_id} as unknown as AgentTurn);
 }return [...unique.values()].sort((a,b)=>a.createdAtMs-b.createdAtMs).slice(-20);
}
