// Event delivery consumes confirmed Sui facts; it never polls RPC for new bills.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {executorConfiguration} from './agent-executor';
import {fetchAgentAllowance,fetchAgentReceipt,moveFields,accountDelegateAddress} from './autopilot-onchain';
import {autopilotRequestId} from './autopilot-request';
import {fetchFullUserStateViaTatum,fetchGroupSplitByIdViaTatum} from './onchain-user-manager';
import {requireWalletMemoryAccess} from './memwal-account';
import {contractConfig,requireAddress} from './config';
import {tatumSuiClient} from './tatum-rpc-client';
import type {executeMemoryRequest} from './memory-service';
export interface DeliveryResult {wallet:string;splitId:string;status:string;digest?:string;}
export interface DeliveryDependencies {
 configuration:typeof executorConfiguration;packageId:()=>string;delegate:typeof accountDelegateAddress;
 transaction:typeof tatumSuiClient.getTransactionBlock;object:typeof tatumSuiClient.getObject;
 state:typeof fetchFullUserStateViaTatum;bill:typeof fetchGroupSplitByIdViaTatum;
 allowance:typeof fetchAgentAllowance;receipt:typeof fetchAgentReceipt;access:typeof requireWalletMemoryAccess;
 execute:typeof executeMemoryRequest;
}
const defaults:DeliveryDependencies={configuration:executorConfiguration,packageId:()=>contractConfig().packageId,delegate:accountDelegateAddress,
 transaction:p=>tatumSuiClient.getTransactionBlock(p),object:p=>tatumSuiClient.getObject(p),state:fetchFullUserStateViaTatum,bill:fetchGroupSplitByIdViaTatum,
 allowance:fetchAgentAllowance,receipt:fetchAgentReceipt,access:requireWalletMemoryAccess,execute:async(...args)=>(await import('./memory-service')).executeMemoryRequest(...args)};
const inFlight=new Map<string,Promise<DeliveryResult[]>>();
export function verifyDeliverySignature(raw:string,issued:string,signature:string,secret:string,now=Date.now()){
 if(secret.length<32||!/^\d+$/.test(issued)||Math.abs(now-Number(issued))>300000||!/^[a-f0-9]{64}$/.test(signature))throw Error('Invalid event delivery authorization.');
 const expected=createHmac('sha256',secret).update(issued+'.'+raw).digest(),received=Buffer.from(signature,'hex');if(!timingSafeEqual(expected,received))throw Error('Invalid event delivery signature.');
}
export async function dispatchConfirmedBill(digest:string,deps:DeliveryDependencies=defaults):Promise<DeliveryResult[]>{
 if(!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(digest))throw Error('Invalid transaction digest.');
 if(!deps.configuration().configured)return [];
 const existing=inFlight.get(digest);if(existing)return existing;
 const work=deliver(digest,deps);inFlight.set(digest,work);try{return await work;}finally{inFlight.delete(digest);}
}
async function deliver(digest:string,deps:DeliveryDependencies){
 const packageId=deps.packageId(),transaction=await deps.transaction({digest,options:{showEffects:true,showEvents:true}});
 if(transaction.effects?.status.status!=='success')throw Error('Only confirmed successful Sui transactions can trigger autopay.');
 const ids=new Set<string>(),out:DeliveryResult[]=[];
 for(const event of transaction.events||[]){if(![packageId+'::core::SplitCreatedEvent',packageId+'::core::SplitActivatedEvent',packageId+'::core::EscrowFundedEvent'].includes(event.type))continue;const p=event.parsedJson as Record<string,unknown>;ids.add(requireAddress(p.split_id));}
 const run=async(wallet:string,splitId:string,operation:'pay'|'activate')=>{
  const state=await deps.state(wallet);if(!state.isRegisteredOnChain)return;
  const vault=await deps.allowance(wallet);if(!vault?.active||vault.expiresAtMs<=Date.now()||(operation==='pay'?!vault.allowIncoming:!vault.allowCreate))return;
  if(vault.profileId!==state.profileId||vault.memoryId!==state.memwalAccountId||vault.executor!==deps.configuration().address||vault.memoryDelegate!==deps.delegate())throw Error('A background allowance has a stale profile, account or executor.');
  const bill=await deps.bill(wallet,splitId);if(operation==='pay'&&!vault.payees.includes(bill.creator))return;
  await deps.access(wallet,state.memwalAccountId);
  const nonce=createHash('sha256').update('incoming:'+digest+':'+splitId+':'+wallet+':'+operation).digest('hex'),requestId=await autopilotRequestId(wallet,nonce);
  const receipt=await deps.receipt(vault.id,requestId);if(receipt){out.push({wallet,splitId,status:'already confirmed',digest:receipt.digest});return;}
  const result=await deps.execute({action:'agent_chat',walletAddress:wallet,sessionAccountId:state.memwalAccountId,autoExecute:true,allowanceEpoch:vault.epoch,autoMemory:false,incomingSplitId:splitId,incomingOperation:operation,threadId:'incoming-'+splitId.slice(2,34),timeZone:'UTC',text:operation==='pay'?'Use my on-chain incoming-payment consent to pay or fund only my eligible share of bill '+splitId+'. Do not change any memory preference or other bill.':'Activate only my fully funded bill '+splitId+' under my on-chain creation consent.'},nonce);
  out.push({wallet,splitId,status:result.execution?.state||'needs review',digest:result.execution?.digest});
 };
 // Bounded delivery; events beyond this bound are rejected for an explicit retry.
 if(ids.size>20)throw Error('Deliver bill events in batches of at most 20.');
 for(const splitId of ids){
  const event=transaction.events!.find(e=>(e.parsedJson as Record<string,unknown>).split_id===splitId&&(e.parsedJson as Record<string,unknown>).creator),creator=(event?.parsedJson as Record<string,unknown>|undefined)?.creator;
  const object=await deps.object({id:splitId,options:{showContent:true}});
  if(object.data?.content?.dataType!=='moveObject')throw Error('The delivered bill is unavailable.');
  const owner=requireAddress(creator||moveFields(object.data.content.fields).creator),bill=await deps.bill(owner,splitId);
  for(const share of bill.participants){if(share.isSettled||share.isFunded||bill.isCancelled||(!bill.isActive&&!share.requiresUpfrontEscrow))continue;await run(share.debtor,splitId,'pay');}
  const fresh=await deps.bill(owner,splitId);if(!fresh.isActive&&!fresh.isCancelled&&fresh.pendingUpfront===0&&Date.now()<=fresh.fundingDeadlineMs)await run(owner,splitId,'activate');
 }
 for(const event of transaction.events||[]){if(event.type!==packageId+'::core::ShareSettledEvent')continue;const p=event.parsedJson as Record<string,unknown>;
  for(const wallet of new Set([requireAddress(p.payer),requireAddress(p.recipient)])){const v=await deps.allowance(wallet);if(!v?.active||!v.allowIncoming||v.expiresAtMs<=Date.now()||v.executor!==deps.configuration().address||v.memoryDelegate!==deps.delegate())continue;const profile=await deps.state(wallet);if(v.profileId!==profile.profileId||v.memoryId!==profile.memwalAccountId)continue;await deps.access(wallet,profile.memwalAccountId);await deps.execute({action:'settlement',walletAddress:wallet,sessionAccountId:profile.memwalAccountId,digest},'event:'+digest);}
 }
 return out;
}
