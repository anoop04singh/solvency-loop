import test from 'node:test';
import assert from 'node:assert/strict';
import { tatumSuiClient } from '../src/lib/tatum-rpc-client';
import { buildLockInCooldownVaultTx,buildSettleSplitShareTx,buildSettleSplitSharesTx, fetchActiveGroupSplitsViaTatum, fetchOwnedCooldownVaultsViaTatum } from '../src/lib/onchain-user-manager';
import { SUI_MAINNET_USDC_TYPE } from '../src/lib/config';
import { installOnboardingFixture } from './fixtures/onboarding';
const a = (n: number) => '0x' + n.toString(16).padStart(64, '0');
process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID = a(1); process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID = a(2);
test('vault builder paginates coins and rejects an insufficient actual reserve', async () => {
  const fixture = installOnboardingFixture();
  const backup = { getCoins: tatumSuiClient.getCoins };
  const cursors: unknown[] = [];
  Object.assign(tatumSuiClient, {
    getCoins: async ({ cursor,limit }: { cursor: string | null;limit:number }) => { assert.ok(limit<=50);cursors.push(cursor); return cursor ? { data: [{ coinObjectId: a(11), balance: '300000000' }], hasNextPage: false } : { data: [{ coinObjectId: a(10), balance: '100000000' }], hasNextPage: true, nextCursor: 'next-page' }; },
  });
  try {
    const tx = await buildLockInCooldownVaultTx({ ownerAddress: a(5), amountUsdc: 100 });
    assert.deepEqual(cursors, [null, 'next-page']);
    assert.deepEqual(tx.getData().commands.map(c => c.$kind), ['MergeCoins', 'SplitCoins', 'MoveCall']);
    const move = tx.getData().commands[2].MoveCall!; assert.equal(move.function, 'lock_in_cooldown_vault'); assert.deepEqual(move.typeArguments, [SUI_MAINNET_USDC_TYPE]);
    Object.assign(tatumSuiClient, { getCoins: async () => ({ data: [{ coinObjectId: a(10), balance: '399999999' }], hasNextPage: false }) });
    await assert.rejects(buildLockInCooldownVaultTx({ ownerAddress: a(5), amountUsdc: 100 }), /Insufficient Circle USDC/);
  } finally { Object.assign(tatumSuiClient, backup); fixture.restore(); }
});
test('settlement and upfront payment preparation respect the gateway limit and retain later coin pages',async()=>{
 const fixture=installOnboardingFixture(),getCoins=tatumSuiClient.getCoins;
 try{
  for(const upfront of [false,true]){
   const cursors:(string|null)[]=[];
   Object.assign(tatumSuiClient,{getCoins:async({owner,coinType,cursor,limit}:{owner:string;coinType:string;cursor:string|null;limit:number})=>{
    if(limit>50)throw new Error('Page size is too large: '+limit+' > 50');
    assert.equal(owner,fixture.wallet);assert.equal(coinType,SUI_MAINNET_USDC_TYPE);cursors.push(cursor);
    return cursor?{data:[{coinObjectId:a(100),balance:'5000000'}],hasNextPage:false,nextCursor:null}:{data:Array.from({length:50},(_,i)=>({coinObjectId:a(30+i),balance:'100000'})),hasNextPage:true,nextCursor:'opaque-next-page'};
   }});
   const tx=await buildSettleSplitShareTx({payerAddress:fixture.wallet,splitObjectId:a(12),amountUsdc:10,upfront});
   assert.deepEqual(cursors,[null,'opaque-next-page']);const commands=tx.getData().commands;
   assert.deepEqual(commands.map(c=>c.$kind),['MergeCoins','SplitCoins','MoveCall']);
   assert.equal(commands[0].MergeCoins!.sources.length,50);
   assert.equal(commands[2].MoveCall!.function,upfront?'fund_split_share':'settle_split_share');
   assert.deepEqual(commands[2].MoveCall!.typeArguments,[SUI_MAINNET_USDC_TYPE]);
  }
  Object.assign(tatumSuiClient,{getCoins:async()=>({data:[],hasNextPage:true,nextCursor:null})});
  await assert.rejects(buildSettleSplitShareTx({payerAddress:fixture.wallet,splitObjectId:a(12),amountUsdc:10}),/pagination did not advance/);
 }finally{Object.assign(tatumSuiClient,{getCoins});fixture.restore();}
});
test('split history and owned vault readers continue through every page', async () => {
  const backup = { queryEvents: tatumSuiClient.queryEvents, multiGetObjects: tatumSuiClient.multiGetObjects, getOwnedObjects: tatumSuiClient.getOwnedObjects };
  let eventPages = 0, vaultPages = 0;
  Object.assign(tatumSuiClient, {
    queryEvents: async ({ cursor }: { cursor: unknown }) => { eventPages++; return { data: [{ parsedJson: { split_id: cursor ? a(12) : a(11) } }], hasNextPage: !cursor, nextCursor: cursor ? null : { txDigest: 'next', eventSeq: '1' } }; },
    multiGetObjects: async ({ ids }: { ids: string[] }) => ids.map(id => ({ data: { objectId: id, content: { dataType: 'moveObject', type: a(1) + '::core::GroupSplitEscrow<' + SUI_MAINNET_USDC_TYPE + '>', fields: { creator: a(5), title: 'bill', total_bill_amount: '4000000', creator_share: '1000000', created_at_ms: '1', funding_deadline_ms: '100', is_active: true, is_cancelled: false, pending_upfront: '0', participants: { fields: { contents: [] } } } } } })),
    getOwnedObjects: async ({ cursor }: { cursor: unknown }) => { vaultPages++; return { data: [{ data: { objectId: cursor ? a(21) : a(20), content: { dataType: 'moveObject', fields: { locked_balance: cursor ? { fields: { value: '2000000' } } : '1000000', unlock_time_ms: '100', trigger_memory_namespace: 'habit_regret' } } } }], hasNextPage: !cursor, nextCursor: cursor ? null : 'next' }; },
  });
  try {
    assert.equal((await fetchActiveGroupSplitsViaTatum(a(5))).length, 2); assert.equal(eventPages, 2);
    const vaults = await fetchOwnedCooldownVaultsViaTatum(a(5)); assert.deepEqual(vaults.map(v => v.amountUsdc), [1, 2]); assert.equal(vaultPages, 2);
  } finally { Object.assign(tatumSuiClient, backup); }
});
test('batch settlement re-reads each bill, totals exact USDC and targets only the connected wallet’s shares',async()=>{
 const fixture=installOnboardingFixture(),getObject=tatumSuiClient.getObject,getCoins=tatumSuiClient.getCoins;
 const states={active:true,settled:false,foreign:false};
 Object.assign(tatumSuiClient,{getObject:async(input:Parameters<typeof getObject>[0])=>{
  if(![a(80),a(81)].includes(input.id))return getObject(input);
  return {data:{objectId:input.id,content:{dataType:'moveObject',type:a(1)+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>',fields:{creator:a(9),title:'Test batch bill',total_bill_amount:'10000001',creator_share:'5000000',created_at_ms:'1',funding_deadline_ms:'100',is_active:states.active,is_cancelled:false,pending_upfront:'0',participants:{fields:{contents:[{fields:{key:fixture.wallet,value:{fields:{debtor:states.foreign?a(8):fixture.wallet,amount_owed:input.id===a(80)?'5000001':'3000000',requires_upfront_escrow:false,is_funded:false,is_settled:states.settled,settled_at_ms:'0'}}}}]}}}}}};
 }});
 try{
  const tx=await buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[a(80),a(81)]}),data=tx.getData();
  assert.deepEqual(data.commands.map(c=>c.$kind),['SplitCoins','MoveCall','SplitCoins','MoveCall']);
  for(const call of data.commands.filter(c=>c.MoveCall).map(c=>c.MoveCall!)){assert.equal(call.function,'settle_split_share');assert.deepEqual(call.typeArguments,[SUI_MAINNET_USDC_TYPE]);assert.equal(call.arguments.length,5);}
  Object.assign(tatumSuiClient,{getCoins:async()=>({data:[{coinObjectId:a(90),balance:'6000000'}],hasNextPage:false})});
  await buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[a(80)]});
  await assert.rejects(buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[a(80),a(81)]}),/Insufficient Circle USDC/);
  Object.assign(tatumSuiClient,{getCoins});
  for(const flag of ['active','settled','foreign'] as const){states[flag]=flag==='active'?false:true;await assert.rejects(buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[a(80)]}));states[flag]=flag==='active'?true:false;}
  await assert.rejects(buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[a(80),a(80)]}),/distinct/);
  await assert.rejects(buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[]}),/distinct/);
  await assert.rejects(buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:Array.from({length:21},(_,i)=>a(100+i))}),/1–20/);
  fixture.state.authorized=false;await assert.rejects(buildSettleSplitSharesTx({payerAddress:fixture.wallet,splitObjectIds:[a(80)]}),/MemWal account/);
 }finally{Object.assign(tatumSuiClient,{getObject,getCoins});fixture.restore();}
});
