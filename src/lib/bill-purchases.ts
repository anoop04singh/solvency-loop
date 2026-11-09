import {requireAddress,contractConfig} from './config';
import {inferBillCategory} from './bill-category';
import {purchaseMemories,regretMemories,type PurchaseMemory} from './financial-insights';
import {positiveUsdc} from './money';
import type {RecalledMemory} from './memory-protocol';
import type {OnChainGroupSplit} from './onchain-user-manager';

export type CheckInPurchase=Pick<PurchaseMemory,'id'|'owner'|'merchant'|'category'|'amountUnits'|'purchasedAtMs'|'splitId'>;
/** A bill is a user's declared expense. Its object proves the split, not a merchant payment. */
export function createdBillPurchase(bill:OnChainGroupSplit,wallet:string):CheckInPurchase|null {
 if(bill.creator!==wallet||bill.isCancelled)return null;
 if(!bill.title.trim()||!Number.isSafeInteger(bill.createdAtMs)||bill.createdAtMs<=0)throw Error('The bill creation details could not be verified.');
 const splitId=requireAddress(bill.splitId,'Bill ID');
 return {id:splitId.slice(2),owner:wallet,splitId,merchant:bill.title,category:bill.category??inferBillCategory(bill.title)??'other',amountUnits:positiveUsdc(bill.creatorShareUsdc).toString(),purchasedAtMs:bill.createdAtMs};
}
export function checkInPurchases(memories:RecalledMemory[],wallet:string,bills:readonly OnChainGroupSplit[]=[]):CheckInPurchase[] {
 const known=new Map(bills.map(bill=>[bill.splitId,bill]));
 const rows=new Map<string,CheckInPurchase>(purchaseMemories(memories,wallet).map(p=>[p.id,p]));
 // Ratings carry their original source so an earlier bill remains available in Show all.
 for(const rating of regretMemories(memories,wallet)){
  if(rating.splitId&&!known.has(rating.splitId)&&requireAddress(rating.splitId).slice(2)===rating.id)rows.set(rating.id,rating);
 }
 for(const bill of bills){
  const row=createdBillPurchase(bill,wallet);
  if(row)rows.set(row.id,row);else if(bill.creator===wallet)rows.delete(bill.splitId.slice(2));
 }
 return [...rows.values()].sort((a,b)=>b.purchasedAtMs-a.purchasedAtMs);
}
export function confirmedCreatedBillIds(events:readonly {type:string;parsedJson?:unknown}[],wallet:string):string[]{
 const type=contractConfig().packageId+'::core::SplitCreatedEvent';
 return [...new Set(events.filter(e=>e.type===type).flatMap(e=>{
  const value=e.parsedJson as {creator?:unknown;split_id?:unknown}|undefined;
  return value?.creator===wallet?[requireAddress(value.split_id,'Created bill ID')]:[];
 }))];
}
