// Server-only execution: no module initialization signs, sends, or starts a worker.
import {Ed25519Keypair} from '@mysten/sui/keypairs/ed25519';
import {Transaction,TransactionDataBuilder} from '@mysten/sui/transactions';
import {autopilotConfig,fetchAgentAllowance,fetchAgentReceipt,moveFields,accountDelegateAddress} from './autopilot-onchain';
import {verifyAutopilotInterface} from './autopilot-interface';
import {autopilotRequestId} from './autopilot-request';
import type {AgentAllowance,AgentExecution} from './autopilot-types';
import {allowanceRoom,rollingSpend} from './autopilot-types';
import type {AgentContext} from './agent-service';
import type {AgentTurn} from './agent-types';
import {requireWalletMemoryAccess} from './memwal-account';
import {contractConfig,getWalletNamespace,SUI_MAINNET_USDC_TYPE} from './config';
import {positiveUsdc,usdcToUnits} from './money';
import {encodeBillTitle} from './bill-category';
import {tatumSuiClient} from './tatum-rpc-client';
import {createScopedMemWalClient} from './walrus-tatum-memory';
import {commitMemoryBatch} from './memory-batch';
import {NETWORK_COMMONS} from './social-memory';
import type {RecalledMemory} from './memory-protocol';
export function getAgentKeypair(){if(typeof window!=='undefined')throw Error('Agent signing is server-only.');const key=process.env.SUI_AGENT_PRIVATE_KEY?.trim();if(!key)throw Error('SUI_AGENT_PRIVATE_KEY is not configured.');return Ed25519Keypair.fromSecretKey(key);}
export function executorConfiguration(){const config=autopilotConfig();if(!config||!process.env.SUI_AGENT_PRIVATE_KEY||process.env.AUTOPILOT_ENABLED!=='true')return {configured:false,address:config?.executor||''};const address=getAgentKeypair().toSuiAddress();if(address!==config.executor)throw Error('Agent executor address does not match its server key.');return {configured:true,address};}
export class ReviewRequired extends Error {}
export function checkAllowance(v:AgentAllowance,c:AgentContext,turn:AgentTurn,executor:string){
 if(v.owner!==c.profile.wallet||v.profileId!==c.profile.profileId||v.memoryId!==c.profile.memwalAccountId||v.memoryDelegate!==accountDelegateAddress()||v.executor!==executor)throw Error('The allowance identity, linked account or executor changed.');
 if((c.allowance&&c.allowance.epoch!==v.epoch)||!v.active||v.expiresAtMs<=c.now)throw new ReviewRequired('The agent allowance is paused or expired. Renew it or review with your wallet.');
 const a=turn.action;let amount=0n;
 if(a.kind==='split'){if(!v.allowCreate||usdcToUnits(a.draft.total)>BigInt(v.perTxUnits)||a.draft.people.some(p=>!v.payees.includes(p.walletAddress)))throw new ReviewRequired('This split is outside your approved creation cap or counterparties. Review it manually.');}
 else if(a.kind==='settle'||a.kind==='fund'){
  const ids=a.kind==='settle'?a.splitIds:[a.splitId];const bills=ids.map(id=>c.splits.find(b=>b.splitId===id));if(bills.some(b=>!b||!v.payees.includes(b.creator)))throw new ReviewRequired('A bill creator is outside your approved counterparties.');
  amount=positiveUsdc(a.amount);
 }else if(a.kind==='protect'){if(!v.allowCooldown)throw new ReviewRequired('Agent cooldown protection is not enabled.');amount=positiveUsdc(a.amount);}
 else if(a.kind==='activate'){if(!v.allowCreate)throw new ReviewRequired('Agent bill activation is not enabled.');}
 else throw new ReviewRequired('This action keeps its manual approval flow.');
 if(rollingSpend(v,c.now)>BigInt(v.dailyUnits)||amount>BigInt(v.perTxUnits)||amount>allowanceRoom(v,c.now)||amount>BigInt(v.balanceUnits))throw new ReviewRequired('This request exceeds the funded balance, per-transaction cap or remaining rolling 24-hour quota. Review manually or update your allowance.');
 if(v.history.filter(h=>c.now-h.atMs<86400000).length+(a.kind==='settle'?a.splitIds.length:1)>64)throw new ReviewRequired('The allowance has reached its rolling 64-action limit.');
}
export function buildDelegatedTransaction(v:AgentAllowance,turn:AgentTurn,requestId:string){
 const config=autopilotConfig();if(!config)throw Error('Autopilot is not configured.');const a=turn.action,tx=new Transaction();tx.setSender(v.executor);
 const request=Array.from(Uint8Array.from(requestId.match(/../g)!,h=>parseInt(h,16))),base=()=>[tx.object(v.id),tx.object(v.memoryId),tx.pure.u64(v.epoch)],suffix=()=>[tx.pure.vector('u8',request),tx.object('0x6')];
 const call=(name:string,args:Parameters<Transaction['moveCall']>[0]['arguments'])=>tx.moveCall({target:config.packageId+'::autopilot::'+name,typeArguments:[SUI_MAINNET_USDC_TYPE],arguments:args});
 if(a.kind==='split'&&a.draft.conventionId)call('create_conventional_split_by_agent',[...base(),tx.object(a.draft.conventionId),tx.pure.string(encodeBillTitle(a.draft.title,a.draft.category)),tx.pure.u64(positiveUsdc(a.draft.total)),tx.pure.vector('bool',a.allocation.shares.map(p=>p.requiresUpfrontEscrow)),...suffix()]);
 else if(a.kind==='split')call('create_group_split_by_agent',[...base(),tx.pure.string(encodeBillTitle(a.draft.title,a.draft.category)),tx.pure.u64(positiveUsdc(a.draft.total)),tx.pure.vector('address',a.allocation.shares.map(p=>p.walletAddress)),tx.pure.vector('u64',a.allocation.shares.map(p=>usdcToUnits(p.amountUsdc))),tx.pure.vector('bool',a.allocation.shares.map(p=>p.requiresUpfrontEscrow)),...suffix()]);
 else if(a.kind==='protect')call('protect_by_agent',[...base(),tx.pure.u64(positiveUsdc(a.amount)),...suffix()]);
 else if(a.kind==='activate')call('activate_split_by_agent',[...base(),tx.object(a.splitId),...suffix()]);
 else if(a.kind==='settle'||a.kind==='fund'){
  // One durable request record per PTB. Different child keys prevent repeated
  // calls in a batch; the root request is the last call and commits atomically.
  const ids=a.kind==='settle'?a.splitIds:[a.splitId];
  if(ids.length!==1)throw new ReviewRequired('Use one bill per autonomous command; the manual batch settlement is still available.');
  call('settle_share_by_agent',[...base(),tx.object(ids[0]),...suffix()]);
 }else throw new ReviewRequired('This action requires your wallet.');return tx;
}
let signingTail:Promise<unknown>=Promise.resolve();
async function serialized<T>(work:()=>Promise<T>):Promise<T>{const next=signingTail.then(work,work);signingTail=next.catch(()=>{});return next;}
export async function sendAgentTransaction(tx:Transaction):Promise<{state:'confirmed'|'submitted'|'failed';digest:string;warning?:string}>{
 return serialized(async()=>{const signer=getAgentKeypair(),bytes=await tx.build({client:tatumSuiClient}),digest=TransactionDataBuilder.getDigestFromBytes(bytes),signed=await signer.signTransaction(bytes);
  try{const result=await tatumSuiClient.executeTransactionBlock({transactionBlock:bytes,signature:signed.signature,options:{showEffects:true}});
   if(result.digest!==digest)return {state:'submitted',digest,warning:'The provider returned an unexpected digest. Check the locally signed transaction before continuing.'};
   if(result.effects?.status.status==='failure')return {state:'failed',digest,warning:result.effects.status.error||'The delegated transaction failed.'};
   const checked=await tatumSuiClient.waitForTransaction({digest,options:{showEffects:true}});if(checked.effects?.status.status!=='success')return {state:'failed',digest,warning:checked.effects?.status.error||'The transaction failed.'};return {state:'confirmed',digest};
  }catch{return {state:'submitted',digest,warning:'Submission or confirmation is uncertain. Check this digest; no signed mutation was retried.'};}
 });
}
export interface ExecutorDependencies {
 configuration:typeof executorConfiguration;vault:typeof fetchAgentAllowance;receipt:typeof fetchAgentReceipt;abi:()=>Promise<void>;access:typeof requireWalletMemoryAccess;
 send:typeof sendAgentTransaction;learn:typeof learnAgentReceipt;
}
const defaults:ExecutorDependencies={configuration:executorConfiguration,vault:fetchAgentAllowance,receipt:fetchAgentReceipt,abi:verifyAutopilotInterface,access:requireWalletMemoryAccess,send:sendAgentTransaction,learn:learnAgentReceipt};
export async function executeAutonomousAction(turn:AgentTurn,c:AgentContext,deps:ExecutorDependencies=defaults):Promise<{execution:AgentExecution;memories:RecalledMemory[]}>{
 const requestId=await autopilotRequestId(turn.owner,turn.id),result=(state:AgentExecution['state'],warning?:string,digest?:string)=>({execution:{state,requestId,kind:turn.action.kind,...(warning?{warning}:{}),...(digest?{digest}:{})},memories:[] as RecalledMemory[]});
 const config=deps.configuration();if(!config.configured)return result('review_required','The operator has not configured an autonomous executor.');
 const v=await deps.vault(c.profile.wallet);if(!v)return result('review_required','Fund and authorize your own allowance before using autopilot.');
 await deps.abi();await deps.access(c.profile.wallet,c.profile.memwalAccountId);
 const previous=await deps.receipt(v.id,requestId);if(previous){try{return {execution:{state:'confirmed',requestId,kind:'recovered',digest:previous.digest},memories:await deps.learn(v,requestId)};}catch{return {...result('confirmed','An earlier delivery confirmed. Receipt learning needs a memory-only retry.',previous.digest),execution:{...result('confirmed',undefined,previous.digest).execution,kind:'recovered'}};}}
 let tx:Transaction;try{checkAllowance(v,{...c,now:Date.now()},turn,config.address);tx=buildDelegatedTransaction(v,turn,requestId);}catch(e){if(e instanceof ReviewRequired)return result('review_required',e.message);throw e;}
 const sent=await deps.send(tx);if(sent.state==='failed')return result('review_required',sent.warning,sent.digest);if(sent.state==='submitted')return result('submitted',sent.warning,sent.digest);
 try{return {execution:{state:'confirmed',requestId,kind:turn.action.kind,digest:sent.digest},memories:await deps.learn(v,requestId)};}catch{return result('confirmed','Transaction confirmed. Receipt learning needs a memory-only retry.',sent.digest);}
}
export async function learnAgentReceipt(v:AgentAllowance,requestId:string){
 const {fetchFullUserStateViaTatum}=await import('./onchain-user-manager');const profile=await fetchFullUserStateViaTatum(v.owner);if(profile.profileId!==v.profileId||profile.memwalAccountId!==v.memoryId)throw Error('The linked account changed; refresh the allowance before learning.');
 await requireWalletMemoryAccess(v.owner,v.memoryId);const receipt=await fetchAgentReceipt(v.id,requestId);if(!receipt)throw Error('No committed agent receipt exists yet.');
 const tx=await tatumSuiClient.getTransactionBlock({digest:receipt.digest,options:{showEffects:true,showEvents:true}}),config=autopilotConfig()!;
 if(tx.effects?.status.status!=='success'||!/^\d+$/.test(String(tx.checkpoint))||!tx.events?.some(e=>{const p=e.parsedJson as Record<string,unknown>;return e.type===config.origin+'::autopilot::AgentActionEvent'&&p.owner===v.owner&&p.vault_id===v.id&&p.object_id===receipt.objectId;}))throw Error('Agent receipt proof is not confirmed on chain.');
 const namespace=getWalletNamespace(v.owner,'social_split_trust'),items:{text:string;namespace:string;category:'social_split_trust'}[]=[];
 items.push({text:'Verified agent transaction. SOLVENCY_AGENT_EXECUTION_V1 '+JSON.stringify({owner:v.owner,vaultId:v.id,requestId,...receipt,checkpoint:String(tx.checkpoint)}),namespace,category:'social_split_trust'});
 const {packageId}=contractConfig();
 for(const e of tx.events||[]){const p=e.parsedJson as Record<string,unknown>;if(e.type!==packageId+'::core::ShareSettledEvent'||(p.payer!==v.owner&&p.recipient!==v.owner))continue;
  const split=await tatumSuiClient.getObject({id:String(p.split_id),options:{showContent:true}});if(split.data?.content?.dataType!=='moveObject'||split.data.content.type!==packageId+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>')throw Error('Settlement source is unavailable.');
  const createdAtMs=Number(moveFields(split.data.content.fields).created_at_ms),settledAtMs=Number(p.settled_at_ms);if(!Number.isSafeInteger(createdAtMs)||!Number.isSafeInteger(settledAtMs)||settledAtMs<createdAtMs)throw Error('Invalid settlement times.');
  const record={subject:p.payer,recipient:p.recipient,splitId:p.split_id,digest:receipt.digest,eventSeq:e.id.eventSeq,amountUnits:String(p.amount),settledAtMs,lagMs:settledAtMs-createdAtMs,checkpoint:String(tx.checkpoint)};
  items.push({text:'Verified settlement. SOLVENCY_SETTLEMENT_V1 '+JSON.stringify(record),namespace,category:'social_split_trust'},{text:'Public on-chain settlement. SOLVENCY_PUBLIC_SETTLEMENT_V1 '+JSON.stringify(record),namespace:NETWORK_COMMONS,category:'social_split_trust'});
 }
 const object=await tatumSuiClient.getObject({id:receipt.objectId,options:{showContent:true}});
 if(receipt.kind===0&&object.data?.content?.dataType==='moveObject'){
  if(object.data.content.type!==packageId+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>')throw Error('Created bill type mismatch.');
  const f=moveFields(object.data.content.fields),participants=moveFields(f.participants).contents;if(!Array.isArray(participants))throw Error('Bill allocations are unavailable.');
  for(const p of participants){const member=moveFields(moveFields(p).value);items.push({text:'Confirmed bill allocation, not repayment proof. '+JSON.stringify({splitId:receipt.objectId,creator:v.owner,debtor:member.debtor,amountUnits:String(member.amount_owed),requiresUpfront:member.requires_upfront_escrow,digest:receipt.digest,checkpoint:String(tx.checkpoint)}),namespace,category:'social_split_trust'});}
 }
 const client=createScopedMemWalClient(v.owner,'social_split_trust',v.memoryId);try{return await commitMemoryBatch(client,items,'receipt:'+v.id+':'+requestId);}finally{client.destroy();}
}
