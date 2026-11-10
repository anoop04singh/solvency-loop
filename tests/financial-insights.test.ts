import test from 'node:test';
import assert from 'node:assert/strict';
import {computeExpense,type ExpensePerson} from '../src/lib/expense';
import {spendingRoom,settlementSummary,DAY_MS,CHECKIN_DELAY_MS,localHour,purchaseMemories,regretMemories,type PurchaseMemory,type RegretMemory,type VerifiedSettlement} from '../src/lib/financial-insights';
import {usdcToUnits} from '../src/lib/money';
import type {RecalledMemory} from '../src/lib/memory-protocol';
const wallet='0x'+'1'.repeat(64),friend='0x'+'2'.repeat(64),other='0x'+'3'.repeat(64);
const people:ExpensePerson[]=[{id:'1',handle:'Test contact',walletAddress:friend,customAmount:'',upfront:false},{id:'2',handle:'Other',walletAddress:other,customAmount:'',upfront:false}];
const memory=(marker:string,value:unknown,category:RecalledMemory['category']='habit_regret'):RecalledMemory=>({blob_id:JSON.stringify(value),text:marker+' '+JSON.stringify(value),namespace:'test-only',category});
const rule=(policy='adaptive',excludeAlcohol=false)=>memory('SOLVENCY_RULE_V1',{subject:friend,upfrontAboveUsdc:40,fundingPolicy:policy,excludeAlcohol,updatedAtMs:1},'social_split_trust');
const event=(n:number,days:number):VerifiedSettlement=>({digest:String(n),eventSeq:'0',splitId:wallet,payer:friend,recipient:wallet,amountUnits:'50000000',createdAtMs:1_700_000_000_000+n*30*DAY_MS,settledAtMs:1_700_000_000_000+n*30*DAY_MS+days*DAY_MS,lagMs:days*DAY_MS,checkpoint:'123'});
const now=Date.UTC(2026,9,31,23),purchase=(n:number):PurchaseMemory=>({id:'purchase-test-'+String(n).padStart(4,'0'),owner:wallet,merchant:'Test merchant',category:'food_delivery',amountUnits:'30000000',purchasedAtMs:now-4*DAY_MS-n*DAY_MS,timeZone:'UTC',localHour:23,recordedAtMs:now-3*DAY_MS,checkpoint:'123',balanceUnits:'500000000'});
const rating=(n:number,verdict:'regretted'|'worth_it'='regretted'):RegretMemory=>({...purchase(n),verdict,intensity:verdict==='regretted'?4:0,checkedAtMs:now-DAY_MS});
test('receipt shares exclude saved alcohol preferences and conserve every micro-USDC',()=>{
 const result=computeExpense(wallet,people,'16.50','items',[rule('adaptive',true)],true,{items:[{id:'1',label:'Food',kind:'food',amount:'11.50'},{id:'2',label:'Drinks',kind:'alcohol',amount:'5.00'}]});
 assert.equal(result.shares[0].amountUsdc,3.833333);assert.deepEqual(result.shares[0].excludedItems,['Drinks']);
 assert.equal(usdcToUnits(result.creatorShare)+result.shares.reduce((n,s)=>n+usdcToUnits(s.amountUsdc),0n),16_500_000n);
 const manual=computeExpense(wallet,people,'16.50','items',[rule('adaptive',true)],false,{items:[{id:'1',label:'Drinks',kind:'alcohol',amount:'16.50'}]});
 assert.equal(manual.shares[0].amountUsdc,5.5);
});
test('receipt validation rejects nonconserving, empty, foreign and zero-share allocations',()=>{
 const item={id:'1',label:'Item',kind:'food' as const,amount:'12'};
 for(const items of [[],[{...item,amount:'11'}],[{...item,wallets:[wallet,friend,'0x'+'4'.repeat(64)]}],[{...item,wallets:[friend]}],[{...item,wallets:[]}]]){
  assert.throws(()=>computeExpense(wallet,people,'12','items',[],true,{items}));
 }
});
test('adaptive deposits require verified qualifying history and relax as the latest payments improve',()=>{
 const slow=[event(1,14.5),event(2,14.5),event(3,14.5)];
 const split=(observations:VerifiedSettlement[],memories=[rule()])=>computeExpense(wallet,[people[0]],'100','equal',memories,true,{observations}).shares[0];
 assert.equal(split(slow.slice(0,2)).requiresUpfrontEscrow,false);
 assert.equal(split(slow).requiresUpfrontEscrow,true);
 const fast=[4,5,6,7,8].map(n=>event(n,.01));
 assert.equal(split([...slow,...fast]).requiresUpfrontEscrow,false);
 assert.equal(split([...slow,...fast]).history.count,5);
 assert.equal(split([...slow,...fast]).history.onTimeRate,100);
 assert.equal(split(slow,[rule('never')]).requiresUpfrontEscrow,false);
 assert.equal(split(fast,[rule('always')]).requiresUpfrontEscrow,true);
 assert.equal(computeExpense(wallet,[{...people[0],upfront:true}],'100','equal',[],false,{observations:fast}).shares[0].requiresUpfrontEscrow,true);
});
test('legacy manual rules stay manual and thresholds are strictly above the share',()=>{
 const legacy=memory('SOLVENCY_RULE_V1',{subject:friend,upfrontAboveUsdc:40},'social_split_trust');
 assert.equal(computeExpense(wallet,[people[0]],'100','equal',[legacy],true).shares[0].requiresUpfrontEscrow,true);
 assert.equal(computeExpense(wallet,[people[0]],'80','equal',[legacy],true).shares[0].requiresUpfrontEscrow,false);
 assert.equal(settlementSummary([event(1,14),event(1,14),{...event(2,14),recipient:other}],wallet,friend).count,1);
});
test('unverified recalled settlement text alone cannot require a deposit',()=>{
 const claimed=memory('SOLVENCY_SETTLEMENT_V1',{subject:friend,recipient:wallet,lagMs:99*DAY_MS},'social_split_trust');
 assert.equal(computeExpense(wallet,[people[0]],'100','equal',[claimed],true).shares[0].requiresUpfrontEscrow,false);
});
test('6-hour structured purchase ratings are owner scoped and use the latest rating once',()=>{
 const first=rating(1),newer={...first,verdict:'worth_it' as const,intensity:0,checkedAtMs:now-1000};
 const all=[memory('SOLVENCY_PURCHASE_V1',purchase(1)),memory('SOLVENCY_PURCHASE_V1',{...purchase(2),owner:other}),memory('SOLVENCY_REGRET_V1',first),memory('SOLVENCY_REGRET_V1',newer),memory('SOLVENCY_REGRET_V1',{...rating(3),checkedAtMs:purchase(3).purchasedAtMs+CHECKIN_DELAY_MS-1})];
 assert.equal(purchaseMemories(all,wallet).length,1);assert.deepEqual(regretMemories(all,wallet).map(r=>r.verdict),['worth_it']);
});
test('spending suggestions need enough check-ins and conserve the live wallet balance',()=>{
 const ratings=[1,2,3].map(n=>memory('SOLVENCY_REGRET_V1',rating(n)));
 assert.equal(spendingRoom(100,20,10,ratings.slice(0,2),wallet,now).shield,0);
 const room=spendingRoom(100,20,10,ratings,wallet,now);
 assert.equal(room.highRegret,true);assert.equal(room.shield,30);assert.equal(room.quota,40);
 assert.equal(usdcToUnits(room.reserve)+usdcToUnits(room.unpaid)+usdcToUnits(room.quota)+usdcToUnits(room.shield),100_000_000n);
 assert.equal(spendingRoom(10,20,10,ratings,wallet,now).quota,0);
});
test('cashflow elasticity needs joined observations, caps the shield and ignores duplicate ratings',()=>{
 const ratings=[1,2,3].map(n=>memory('SOLVENCY_REGRET_V1',rating(n)));
 const cashflows=[1,2].map(n=>memory('SOLVENCY_CASHFLOW_V1',{purchaseId:purchase(n).id,owner:wallet,balanceUnits:'200000000',regretScore:4,checkedAtMs:now-DAY_MS},'cashflow_elasticity'));
 const room=spendingRoom(100,20,10,[...ratings,...ratings,...cashflows],wallet,now);
 assert.equal(room.sampleCount,3);assert.equal(room.shield,37.5);assert.equal(room.elasticityApplied,true);
 assert.equal(spendingRoom(100,90,0,[...ratings,...cashflows],wallet,now).shield,10);
 assert.equal(spendingRoom(100,20,10,[...ratings,cashflows[0]],wallet,now).elasticityApplied,false);
 const updated=[...ratings,memory('SOLVENCY_REGRET_V1',{...rating(1,'worth_it'),checkedAtMs:now-100}),memory('SOLVENCY_REGRET_V1',{...rating(2,'worth_it'),checkedAtMs:now-100})];
 assert.equal(spendingRoom(100,20,10,updated,wallet,now).shield,0);
});
test('regret windows cross midnight and respect the browser timezone without stale/future samples',()=>{
 const ratings=[1,2,3].map(n=>memory('SOLVENCY_REGRET_V1',rating(n)));
 assert.equal(spendingRoom(100,0,0,ratings,wallet,now+3600000,'UTC').highRegret,true);
 assert.equal(spendingRoom(100,0,0,ratings,wallet,now,'Asia/Kolkata').highRegret,false);
 assert.equal(localHour(now,'Asia/Kolkata'),4);
 const stale=ratings.map(m=>({...m,text:m.text.replace(/"purchasedAtMs":\d+/,'"purchasedAtMs":'+(now-100*DAY_MS))}));
 assert.equal(spendingRoom(100,0,0,stale,wallet,now).shield,0);
});
