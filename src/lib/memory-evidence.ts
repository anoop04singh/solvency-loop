import { contractConfig, requireAddress, SUI_MAINNET_USDC_TYPE } from './config';
import { memoryRecord, type VerifiedSettlement } from './financial-insights';
import type { RecalledMemory } from './memory-protocol';
import type { MemoryDependencies } from './memory-service';
import {createHash} from 'node:crypto';

/** Share exact receipt/object reads within one request, never across owners or requests. */
export function settlementReadScope(deps:Pick<MemoryDependencies,'transaction'|'object'>):Pick<MemoryDependencies,'transaction'|'object'> {
  const transactions=new Map<string,ReturnType<MemoryDependencies['transaction']>>(),objects=new Map<string,ReturnType<MemoryDependencies['object']>>();
  return {
    transaction:p=>{const key=JSON.stringify(p);let read=transactions.get(key);if(!read){read=deps.transaction(p);transactions.set(key,read);}return read;},
    object:p=>{const key=JSON.stringify(p);let read=objects.get(key);if(!read){read=deps.object(p);objects.set(key,read);}return read;},
  };
}

/** Recalled text alone is never proof. Re-read successful package events and split creation times. */
export async function verifyRecalledSettlements(memories:RecalledMemory[],wallet:string,deps:Pick<MemoryDependencies,'transaction'|'object'>,page?:{offset:number;limit:number;snapshot?:string}) {
  const {packageId}=contractConfig(),candidates=new Map<string,Record<string,unknown>>();
  for(const memory of memories){if(memory.category!=='social_split_trust')continue;const r=memoryRecord(memory.text,'SOLVENCY_SETTLEMENT_V1');
    if(!r||typeof r.digest!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(r.digest)||r.recipient!==wallet||typeof r.subject!=='string'||typeof r.splitId!=='string')continue;
    try{requireAddress(r.subject);requireAddress(r.splitId);}catch{continue;}
    candidates.set(r.digest+':'+r.splitId+':'+r.subject+':'+String(r.eventSeq||''),r);
  }
  const identity=(value:Record<string,unknown>)=>String(value.digest)+':'+String(value.eventSeq||'')+':'+String(value.splitId)+':'+String(value.subject);
  const recent=[...candidates.values()].sort((a,b)=>Number(b.settledAtMs||0)-Number(a.settledAtMs||0)||identity(a).localeCompare(identity(b))).slice(0,20);
  if(page&&(!Number.isInteger(page.offset)||page.offset<0||page.offset>15||!Number.isInteger(page.limit)||page.limit<1||page.limit>5))throw Error('Invalid evidence page.');
  const snapshot=page?createHash('sha256').update(JSON.stringify(recent)).digest('hex'):undefined;
  if(page?.snapshot&&page.snapshot!==snapshot)throw Error('Your payment history changed while loading. Retry sign-in to verify one consistent evidence snapshot.');
  const selected=page?recent.slice(page.offset,page.offset+page.limit):recent;
  const transactions=new Map<string,Awaited<ReturnType<MemoryDependencies['transaction']>>>(),objects=new Map<string,Awaited<ReturnType<MemoryDependencies['object']>>>();
  const verified=new Map<string,VerifiedSettlement>();let rejectedEvidenceCount=0;
  for(const candidate of selected){
    const digest=String(candidate.digest),splitId=String(candidate.splitId);
    if(!transactions.has(digest))transactions.set(digest,await deps.transaction({digest,options:{showEffects:true,showEvents:true}}));
    const transaction=transactions.get(digest)!;
    if(transaction.effects?.status.status!=='success'){rejectedEvidenceCount++;continue;}
    const event=(transaction.events||[]).find(event=>{const data=event.parsedJson as Record<string,unknown>;return event.type===packageId+'::core::ShareSettledEvent'&&event.id.txDigest===digest&&/^\d+$/.test(event.id.eventSeq)&&data?.payer===candidate.subject&&data.recipient===wallet&&data.split_id===splitId&&data.amount===candidate.amountUnits&&(candidate.eventSeq===undefined||String(candidate.eventSeq)===event.id.eventSeq);});
    if(!event){rejectedEvidenceCount++;continue;}
    if(!objects.has(splitId))objects.set(splitId,await deps.object({id:splitId,options:{showContent:true}}));
    const object=objects.get(splitId)!;
    if(object.data?.content?.dataType!=='moveObject'||object.data.content.type!==packageId+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>'){rejectedEvidenceCount++;continue;}
    const fields=object.data.content.fields as Record<string,unknown>,data=event.parsedJson as Record<string,unknown>;
    const createdAtMs=Number(fields.created_at_ms),settledAtMs=Number(data.settled_at_ms),amountUnits=String(data.amount),checkpoint=String(transaction.checkpoint||'');
    if(!Number.isSafeInteger(createdAtMs)||!Number.isSafeInteger(settledAtMs)||createdAtMs<=0||settledAtMs<createdAtMs||candidate.lagMs!==settledAtMs-createdAtMs||!/^\d+$/.test(checkpoint)||!/^\d{1,20}$/.test(amountUnits)||BigInt(amountUnits)<=0n){rejectedEvidenceCount++;continue;}
    verified.set(digest+':'+event.id.eventSeq,{digest,eventSeq:event.id.eventSeq,splitId,payer:requireAddress(data.payer),recipient:wallet,amountUnits,createdAtMs,settledAtMs,lagMs:settledAtMs-createdAtMs,checkpoint});
  }
  return {verifiedSettlements:[...verified.values()],rejectedEvidenceCount,evidenceLimitReached:candidates.size>recent.length,...(page?{evidenceSnapshot:snapshot!,nextEvidenceOffset:page.offset+page.limit<recent.length?page.offset+page.limit:null}:{})};
}
