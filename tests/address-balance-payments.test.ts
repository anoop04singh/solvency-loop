import test from 'node:test';
import assert from 'node:assert/strict';
import {Transaction} from '@mysten/sui/transactions';
import {tatumSuiClient} from '../src/lib/tatum-rpc-client';
import {SUI_MAINNET_USDC_TYPE} from '../src/lib/config';
import {paymentCoins,buildSettleSplitShareTx,buildLockInCooldownVaultTx} from '../src/lib/onchain-user-manager';
import {installOnboardingFixture,a} from './fixtures/onboarding';

test('address-only USDC funds settle through a sender withdrawal and consume the exact zero change',async()=>{
 const fixture=installOnboardingFixture();
 try{
  Object.assign(tatumSuiClient,{getCoins:async()=>({data:[],hasNextPage:false})});
  Object.assign(tatumSuiClient.core,{getBalance:async({owner,coinType}:{owner:string;coinType:string})=>{
   assert.equal(owner,fixture.wallet);assert.equal(coinType,SUI_MAINNET_USDC_TYPE);
   return {balance:{balance:'1000000',coinBalance:'0',addressBalance:'1000000',coinType}};
  }});
  for(const upfront of [false,true]){
   const tx=await buildSettleSplitShareTx({payerAddress:fixture.wallet,splitObjectId:a(90),amountUsdc:0.02,upfront});
   const data=tx.getData(),withdrawal=data.inputs.find(i=>i.FundsWithdrawal)?.FundsWithdrawal;
   assert.equal(withdrawal?.reservation.MaxAmountU64,'20000');
   assert.equal(withdrawal?.withdrawFrom.Sender,true);
   assert.equal(withdrawal?.typeArg.Balance,SUI_MAINNET_USDC_TYPE);
   assert.deepEqual(data.commands.map(c=>c.MoveCall?.function||c.$kind),['redeem_funds','SplitCoins',upfront?'fund_split_share':'settle_split_share','destroy_zero']);
  }
 }finally{fixture.restore();}
});

test('mixed balances withdraw only the shortfall and preserve reserve coins without masking read failures',async()=>{
 const fixture=installOnboardingFixture();
 try{
  Object.assign(tatumSuiClient,{getCoins:async()=>({data:[{coinObjectId:a(10),balance:'100000000'}],hasNextPage:false})});
  Object.assign(tatumSuiClient.core,{getBalance:async()=>({balance:{balance:'400000000',coinBalance:'100000000',addressBalance:'300000000',coinType:SUI_MAINNET_USDC_TYPE}})});
  const tx=await buildLockInCooldownVaultTx({ownerAddress:fixture.wallet,amountUsdc:100});
  const data=tx.getData();
  assert.equal(data.inputs.find(i=>i.FundsWithdrawal)?.FundsWithdrawal?.reservation.MaxAmountU64,'300000000');
  assert.equal(data.commands.at(-1)?.MoveCall?.function,'lock_in_cooldown_vault');
  assert(data.commands.some(c=>c.MergeCoins));
  Object.assign(tatumSuiClient.core,{getBalance:async()=>({balance:{addressBalance:'299999999'}})});
  await assert.rejects(buildLockInCooldownVaultTx({ownerAddress:fixture.wallet,amountUsdc:100}),/Insufficient Circle USDC/);
  Object.assign(tatumSuiClient.core,{getBalance:async()=>{throw Error('Balance read unavailable');}});
  await assert.rejects(buildLockInCooldownVaultTx({ownerAddress:fixture.wallet,amountUsdc:100}),/Balance read unavailable/);
  const foreign=new Transaction();foreign.setSender(a(99));
  await assert.rejects(paymentCoins(fixture.wallet,1n,foreign),/transaction sender/);
 }finally{fixture.restore();}
});
