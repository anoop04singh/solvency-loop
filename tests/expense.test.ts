import test from 'node:test';
import assert from 'node:assert/strict';
import {computeExpense,type ExpensePerson} from '../src/lib/expense';
import {usdcToUnits} from '../src/lib/money';
import {validatePayload,type RecalledMemory} from '../src/lib/memory-protocol';
const a=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const people=(count:number):ExpensePerson[]=>Array.from({length:count},(_,i)=>({id:String(i),handle:'Person '+i,walletAddress:a(i+2),customAmount:'1',upfront:false}));
test('equal bills support arbitrary group sizes and conserve every micro-USDC',()=>{
 for(const size of [1,2,3,7,64]){const p=computeExpense(a(1),people(size),'100.000001','equal',[],false);assert.equal(p.shares.reduce((n,s)=>n+usdcToUnits(s.amountUsdc),usdcToUnits(p.creatorShare)),100000001n);assert.equal(p.shares.length,size);}
});
test('custom amounts leave the creator the exact remaining share and reject invalid bills',()=>{
 const p=people(2);p[0].customAmount='2.000001';p[1].customAmount='3';assert.equal(computeExpense(a(1),p,'10','custom',[],false).creatorShare,4.999999);
 for(const amount of ['0','-1','1.0000001','5'])assert.throws(()=>computeExpense(a(1),p,amount,'custom',[],false));
 assert.throws(()=>computeExpense(a(1),[],'10','equal',[],false));assert.throws(()=>computeExpense(a(1),people(65),'100','equal',[],false));
 assert.throws(()=>computeExpense(a(1),[p[0],p[0]],'10','equal',[],false));
});
test('only user-authored preferences affect funding and the newest saved threshold wins',()=>{
 const memory=(threshold:number,updated:number,prefix='My payment preference.'):RecalledMemory=>({blob_id:String(updated),text:prefix+' SOLVENCY_RULE_V1 '+JSON.stringify({subject:a(2),upfrontAboveUsdc:threshold,updatedAtMs:updated}),distance:0,category:'social_split_trust',namespace:'test'});
 const p=people(1),m=[memory(0,100,'Demo rule:'),memory(1,1),memory(10,2)];
 assert.equal(computeExpense(a(1),p,'10','equal',m,true).shares[0].requiresUpfrontEscrow,false);
 assert.equal(computeExpense(a(1),p,'22','equal',m,true).shares[0].requiresUpfrontEscrow,true);
 assert.equal(computeExpense(a(1),p,'22','equal',m,false).shares[0].requiresUpfrontEscrow,false);
 p[0].upfront=true;assert.equal(computeExpense(a(1),p,'10','equal',[],false).shares[0].requiresUpfrontEscrow,true);
});
test('legacy demo seeding is rejected and personal preferences require real canonical contacts',()=>{
 assert.throws(()=>validatePayload({action:'seed_12_mainnet',walletAddress:a(1)}),/Unsupported/);
 assert.throws(()=>validatePayload({action:'save_preference',walletAddress:a(1),subjectWallet:a(1),upfrontAboveUsdc:2}));
 assert.throws(()=>validatePayload({action:'save_preference',walletAddress:a(1),subjectWallet:'contact',upfrontAboveUsdc:2}));
 assert.throws(()=>validatePayload({action:'save_preference',walletAddress:a(1),subjectWallet:a(2),upfrontAboveUsdc:-1}));
 assert.equal(validatePayload({action:'save_preference',walletAddress:a(1),subjectWallet:a(2),upfrontAboveUsdc:0}).action,'save_preference');
});
