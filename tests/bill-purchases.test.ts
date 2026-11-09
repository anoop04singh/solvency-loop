import test from 'node:test';
import assert from 'node:assert/strict';
import {checkInPurchases,createdBillPurchase,confirmedCreatedBillIds} from '../src/lib/bill-purchases';
import {regretMemories,DAY_MS,type RegretMemory} from '../src/lib/financial-insights';
import type {OnChainGroupSplit} from '../src/lib/onchain-user-manager';
import type {RecalledMemory} from '../src/lib/memory-protocol';
import {prepareAgentAction} from '../src/lib/agent-action';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),owner=a(1),now=Date.now();
const bill:OnChainGroupSplit={splitId:a(12),creator:owner,title:'Actual dinner',category:'dining',totalBillUsdc:10,creatorShareUsdc:3.000001,createdAtMs:now-3*DAY_MS,fundingDeadlineMs:now+DAY_MS,isActive:true,isCancelled:false,pendingUpfront:0,participants:[{debtor:a(2),amountOwedUsdc:6.999999,requiresUpfrontEscrow:false,isFunded:false,isSettled:false,settledAtMs:0}]};
test('created bill check-ins use stable source IDs, the creator share and actual bill categories without a memory write',()=>{
 const purchase=createdBillPurchase(bill,owner)!;
 assert.equal(purchase.id,bill.splitId.slice(2));assert.equal(purchase.splitId,bill.splitId);assert.equal(purchase.amountUnits,'3000001');assert.equal(purchase.category,'dining');assert.equal(purchase.purchasedAtMs,bill.createdAtMs);
 assert.equal(createdBillPurchase({...bill,creator:a(2)},owner),null);assert.equal(createdBillPurchase({...bill,isCancelled:true},owner),null);
 assert.equal(checkInPurchases([],owner,[bill,bill]).length,1);
 const rating:RegretMemory={...purchase,timeZone:'UTC',localHour:12,recordedAtMs:now,checkpoint:'123',balanceUnits:'10000000',verdict:'regretted',intensity:4,checkedAtMs:now};
 const memory:RecalledMemory={blob_id:'actual-rating',text:'SOLVENCY_REGRET_V1 '+JSON.stringify(rating),category:'habit_regret',namespace:'owned-test'};
 assert.equal(checkInPurchases([memory],owner,[bill]).length,1);
 assert.equal(checkInPurchases([memory],owner,[])[0].splitId,bill.splitId);
 assert.equal(checkInPurchases([memory],owner,[{...bill,isCancelled:true}]).length,0);
 assert.equal(regretMemories([{...memory,text:memory.text.replace(bill.splitId,'malformed')}],owner).length,0);
});
test('confirmed bill discovery scopes receipts to this package and owner, preserving IDs through event-index lag',()=>{
 const previous=process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID,registry=process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID;process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=a(9);process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=a(10);
 try{assert.deepEqual(confirmedCreatedBillIds([
  {type:a(9)+'::core::SplitCreatedEvent',parsedJson:{creator:owner,split_id:bill.splitId}},
  {type:a(9)+'::core::SplitCreatedEvent',parsedJson:{creator:owner,split_id:bill.splitId}},
  {type:a(9)+'::core::SplitCreatedEvent',parsedJson:{creator:a(2),split_id:a(13)}},
  {type:a(8)+'::core::SplitCreatedEvent',parsedJson:{creator:owner,split_id:a(14)}},
 ],owner),[bill.splitId]);}finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID;else process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=previous;if(registry===undefined)delete process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID;else process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=registry;}
});
test('agent check-in proposals include the exact created bill and timezone for server verification',()=>{
 const result=prepareAgentAction({action:'checkin',ids:[bill.splitId.slice(2)],verdict:'worth_it'},
  {profile:{profileId:a(20),wallet:owner,handle:'Fixture owner',memwalAccountId:a(21),safeFloorUsdc:10,contacts:[],usdcBalance:100,suiBalance:1,latestCheckpoint:'123',isRegisteredOnChain:true},memories:[],splits:[bill],verifiedSettlements:[],vaults:[],now,timeZone:'Asia/Kolkata'});
 assert.equal(result.action.kind,'memory');
 if(result.action.kind==='memory')assert.deepEqual(result.action.payload,{action:'regret_checkin',purchaseId:bill.splitId.slice(2),splitId:bill.splitId,timeZone:'Asia/Kolkata',verdict:'worth_it',intensity:0});
});
