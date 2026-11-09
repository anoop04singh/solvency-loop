import test from 'node:test';
import assert from 'node:assert/strict';
import {bcs} from '@mysten/sui/bcs';
import {fromBase64} from '@mysten/sui/utils';
import {a,installOnboardingFixture} from './fixtures/onboarding';
import {tatumSuiClient} from '../src/lib/tatum-rpc-client';
import {buildAgentAllowanceTx} from '../src/lib/autopilot-onchain';
import {executorSetupError,validateAllowancePolicy,validateAllowanceFunding} from '../src/lib/autopilot-policy';
import type {AllowancePolicy} from '../src/lib/autopilot-types';
import {SUI_MAINNET_USDC_TYPE} from '../src/lib/config';

const policy:AllowancePolicy={budget:'100.000001',perTx:'25',daily:'40',days:2,payees:[],allowCreate:false,allowIncoming:false,allowCooldown:true};
test('setup enforces separate executor, exact reserve and valid policy before approval',()=>{
 assert.match(executorSetupError(a(5),a(5)),/separate dedicated executor/);
 assert.equal(executorSetupError(a(5),a(22)),'');
 assert.throws(()=>executorSetupError(a(5),'0x'+'0'.repeat(64)),/nonzero/);
 validateAllowancePolicy(policy,[],a(5));
 validateAllowanceFunding('200',500,300);
 assert.throws(()=>validateAllowanceFunding('200.000001',500,300),/reserve/);
 assert.throws(()=>validateAllowancePolicy({...policy,daily:'24.999999'},[],a(5)),/at least/);
 for(const days of [0,31,1.5])assert.throws(()=>validateAllowancePolicy({...policy,days},[],a(5)),/1 to 30/);
 assert.throws(()=>validateAllowancePolicy({...policy,allowIncoming:true},[],a(5)),/counterparties/);
 assert.throws(()=>validateAllowancePolicy({...policy,payees:[a(5)]},[a(5)],a(5)),/saved counterparties/);
});

test('allowance builder rejects executor-owner conflict and stale creation, preserves exact native-USDC deposit and reserve',async()=>{
 const f=installOnboardingFixture(),env={NEXT_PUBLIC_AUTOPILOT_PACKAGE_ID:a(30),NEXT_PUBLIC_AUTOPILOT_TYPE_ORIGIN:a(30),NEXT_PUBLIC_AGENT_DIRECTORY_ID:a(31),NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS:f.wallet};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const getObject=tatumSuiClient.getObject,getField=tatumSuiClient.getDynamicFieldObject;
 let vaultExists=false,failLookup=false;
 const vault={id:a(35),owner:f.wallet,profileId:f.profileId,memoryId:f.memoryId,memoryDelegate:a(22),executor:a(22),balanceUnits:'100000000',perTxUnits:'25000000',dailyUnits:'40000000',expiresAtMs:Date.now()+86400000,active:true,epoch:'0',allowCreate:false,allowIncoming:false,allowCooldown:true,payees:[],history:[]};
 try{
  // The reported instruction-68 abort is blocked before any coin or chain reads.
  await assert.rejects(buildAgentAllowanceTx(f.wallet,policy),/separate dedicated executor/);
  assert.equal(f.state.coinReads,0);
  process.env.NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS=a(22);
  Object.assign(tatumSuiClient,{
   getObject:async(p:Parameters<typeof getObject>[0])=>{
    if(p.id==='0x6')return {data:{content:{dataType:'moveObject',type:'0x2::clock::Clock',fields:{timestamp_ms:'1000000000000'}}}};
    if([a(31),a(35)].includes(p.id))return {data:{objectId:p.id,owner:{Shared:{initial_shared_version:'1'}},content:{dataType:'moveObject',type:a(30)+'::autopilot::'+(p.id===a(31)?'AgentDirectory':'AgentAllowanceVault<'+SUI_MAINNET_USDC_TYPE+'>'),fields:p.id===a(31)?{id:{id:p.id},vaults:{id:{id:a(32)}}}:{id:{id:p.id},owner:f.wallet,profile_id:f.profileId,memory_id:f.memoryId,memory_delegate:a(22),agent_executor:a(22),allowance_balance:'100000000',max_per_tx:'25000000',daily_limit:'40000000',expires_at_ms:'1000000000001',active:true,epoch:'0',allow_create:false,allow_incoming:false,allow_cooldown:true,payees:[],history:[]}}}};
    return getObject.call(tatumSuiClient,p);
   },
   getDynamicFieldObject:async(p:Parameters<typeof getField>[0])=>{
    if(p.parentId!==a(32))return getField.call(tatumSuiClient,p);
    if(failLookup)throw Error('Directory unavailable');
    return vaultExists?{data:{content:{dataType:'moveObject',type:'0x2::dynamic_field::Field<address,0x2::object::ID>',fields:{name:f.wallet,value:a(35)}}}}:{error:{code:'dynamicFieldNotFound'}};
   },
  });
  const tx=await buildAgentAllowanceTx(f.wallet,policy),d=tx.getData(),call=d.commands.at(-1)!.MoveCall!;
  assert.equal(call.function,'create_agent_allowance_vault');assert.deepEqual(call.typeArguments,[SUI_MAINNET_USDC_TYPE]);
  const split=d.commands.find(c=>c.SplitCoins)!.SplitCoins!,amountArg=split.amounts[0];assert.ok('Input'in amountArg);
  const input=d.inputs[amountArg.Input];assert.ok(input.Pure);assert.equal(bcs.u64().parse(fromBase64(input.Pure.bytes)),'100000001');
  assert.deepEqual(call.arguments[4],split.coin); // The remaining actual coin proves the reserve on-chain.
  vaultExists=true;const reads=f.state.coinReads;
  await assert.rejects(buildAgentAllowanceTx(f.wallet,policy),/already exists/);assert.equal(f.state.coinReads,reads);
  const configured=(await buildAgentAllowanceTx(f.wallet,policy,vault)).getData();assert.equal(configured.commands[0].MoveCall?.function,'configure_agent_vault');assert.equal(f.state.coinReads,reads);
  vaultExists=false;await assert.rejects(buildAgentAllowanceTx(f.wallet,policy,vault),/allowance changed/);
  failLookup=true;await assert.rejects(buildAgentAllowanceTx(f.wallet,policy),/Directory unavailable/);assert.equal(f.state.coinReads,reads);
 }finally{Object.assign(tatumSuiClient,{getObject,getDynamicFieldObject:getField});f.restore();for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
