import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBillDraft,repeatBillDraft} from '../src/lib/bill-draft';
import {computeExpense} from '../src/lib/expense';
import type {OnChainGroupSplit} from '../src/lib/onchain-user-manager';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),contacts=[{handle:'Casey',walletAddress:a(2)},{handle:'Jordan',walletAddress:a(3)}];
test('smart fill extracts explicit receipt amounts and resolves only actual saved contacts',()=>{
 const draft=parseBillDraft('Paid $16.50 at Corner Cafe ($11.50 food, $5 drinks) with @Casey and Jordan',contacts,a(1));
 assert.equal(draft.title,'Corner Cafe');assert.equal(draft.total,'16.50');assert.equal(draft.mode,'items');assert.deepEqual(draft.items.map(i=>[i.kind,i.amount]),[['food','11.50'],['alcohol','5']]);
 assert.deepEqual(draft.people.map(p=>p.walletAddress),[a(2),a(3)]);const result=computeExpense(a(1),draft.people,draft.total,draft.mode,[],false,{items:draft.items});assert.equal(result.total,16.5);
 const precise=parseBillDraft('1.000001 USDC for Shared receipt with '+a(2),contacts,a(1));assert.equal(precise.total,'1.000001');assert.equal(precise.mode,'equal');
});
test('smart fill refuses missing people, invented wallets, duplicate names and nonconserving money',()=>{
 for(const input of ['Paid 10 at Cafe with Unknown','Paid 10 at Cafe with Casey, Casey','Paid 10 at Cafe (8 food, 3 drinks) with Casey','Paid 10.0000001 at Cafe with Casey','Paid 0 at Cafe with Casey','Send whatever to anyone']){
  assert.throws(()=>parseBillDraft(input,contacts,a(1)),input);
 }
 assert.throws(()=>parseBillDraft('10 at Cafe with Casey',[...contacts,{handle:'Casey',walletAddress:a(4)}],a(1)),/unambiguous/);
 assert.throws(()=>parseBillDraft('10 at Cafe with Me',[{handle:'Me',walletAddress:a(1)}],a(1)),/distinct/);
});
test('repeating a real bill creates only a new draft with exact original shares and fresh funding choices',()=>{
 const bill={creator:a(1),title:'Owned bill',totalBillUsdc:15.000001,participants:[{debtor:a(2),amountOwedUsdc:5.000001,requiresUpfrontEscrow:true,isSettled:true}]} as OnChainGroupSplit;
 const draft=repeatBillDraft(bill,a(1),contacts);assert.equal(draft.mode,'custom');assert.equal(draft.people[0].upfront,false);assert.equal(draft.people[0].customAmount,'5.000001');assert.equal(draft.people[0].handle,'Casey');
 assert.equal(computeExpense(a(1),draft.people,draft.total,draft.mode,[],false).creatorShare,10);
 assert.throws(()=>repeatBillDraft(bill,a(3),contacts),/your wallet created/);
});
