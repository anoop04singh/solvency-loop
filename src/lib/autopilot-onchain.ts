import {Transaction} from '@mysten/sui/transactions';
import {normalizeStructTag,toBase58,fromBase64} from '@mysten/sui/utils';
import type {SuiObjectResponse} from '@mysten/sui/jsonRpc';
import {tatumSuiClient} from './tatum-rpc-client';
import {requireAddress,SUI_MAINNET_USDC_TYPE} from './config';
import {fetchFullUserStateViaTatum,paymentCoins} from './onchain-user-manager';
import {fetchWalletMemWalAccount} from './memwal-account';
import {onboardingStatus} from './onboarding';
import {positiveUsdc,usdcToUnits} from './money';
import type {AgentAllowance,AutopilotState,AllowancePolicy,PublicSocialPreference,GroupConvention} from './autopilot-types';
import {executorSetupError,validateAllowancePolicy} from './autopilot-policy';
export {validateAllowancePolicy} from './autopilot-policy';
type Fields=Record<string,unknown>;
export function moveFields(v:unknown):Fields {if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Malformed autopilot object.');const r=v as Fields;return r.fields?moveFields(r.fields):r;}
function uid(v:unknown):string {return typeof v==='string'?requireAddress(v):uid(moveFields(v).id);}
function uint(v:unknown){if(!/^\d+$/.test(String(v))||BigInt(String(v))>18446744073709551615n)throw Error('Invalid on-chain integer.');return String(v);}
function timestamp(v:unknown){const n=Number(uint(v));if(!Number.isSafeInteger(n))throw Error('Invalid chain timestamp.');return n;}
function bool(v:unknown){if(typeof v!=='boolean')throw Error('Invalid on-chain permission.');return v;}
function wallets(v:unknown){if(!Array.isArray(v)||v.length>65)throw Error('Invalid wallet list.');return v.map(x=>requireAddress(x));}
export function autopilotConfig(){
 const packageId=process.env.NEXT_PUBLIC_AUTOPILOT_PACKAGE_ID,directoryId=process.env.NEXT_PUBLIC_AGENT_DIRECTORY_ID,executor=process.env.NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS;
 if(!packageId&&!directoryId&&!executor)return null;
 return {packageId:requireAddress(packageId,'Autopilot package'),origin:requireAddress(process.env.NEXT_PUBLIC_AUTOPILOT_TYPE_ORIGIN||packageId,'Autopilot type origin'),directoryId:requireAddress(directoryId,'Agent directory'),executor:requireAddress(executor,'Agent executor')};
}
export function autopilotType(name:string){const c=autopilotConfig();if(!c)throw Error('Autopilot deployment is not configured.');return c.origin+'::autopilot::'+name;}
export async function autopilotObject(id:string,name:string){
 const r=await tatumSuiClient.getObject({id:requireAddress(id),options:{showContent:true,showOwner:true}});
 if(r.error||r.data?.objectId!==id||r.data.content?.dataType!=='moveObject'||normalizeStructTag(r.data.content.type)!==normalizeStructTag(autopilotType(name))||!r.data.owner||typeof r.data.owner!=='object'||!('Shared'in r.data.owner))throw Error('Autopilot '+name+' identity or shared ownership could not be verified.');
 const f=moveFields(r.data.content.fields);if(uid(f.id)!==id)throw Error('Autopilot UID mismatch.');return f;
}
function dfValue(r:SuiObjectResponse,wallet:string,expected:string){
 if(r.error?.code==='dynamicFieldNotFound')return null;
 if(r.error||r.data?.content?.dataType!=='moveObject'||normalizeStructTag(r.data.content.type)!==normalizeStructTag('0x2::dynamic_field::Field<address,'+expected+'>'))throw Error('Agent directory lookup failed.');
 const f=moveFields(r.data.content.fields);if(requireAddress(f.name)!==wallet)throw Error('Agent directory owner mismatch.');return f.value;
}
async function entry(table:unknown,wallet:string,vector=false){return dfValue(await tatumSuiClient.getDynamicFieldObject({parentId:uid(moveFields(table).id),name:{type:'address',value:wallet}}),wallet,vector?'vector<0x2::object::ID>':'0x2::object::ID');}
export async function fetchAgentAllowance(wallet:string,knownDirectory?:Fields):Promise<AgentAllowance|null>{
 const c=autopilotConfig();if(!c)return null;wallet=requireAddress(wallet);
 const d=knownDirectory||await autopilotObject(c.directoryId,'AgentDirectory'),value=await entry(d.vaults,wallet);if(value===null)return null;
 const id=uid(value),f=await autopilotObject(id,'AgentAllowanceVault<'+SUI_MAINNET_USDC_TYPE+'>');if(requireAddress(f.owner)!==wallet)throw Error('Allowance belongs to another wallet.');
 if(!Array.isArray(f.history)||f.history.length>64)throw Error('Invalid allowance history.');
 return {id,owner:wallet,profileId:uid(f.profile_id),memoryId:requireAddress(f.memory_id),memoryDelegate:requireAddress(f.memory_delegate),executor:requireAddress(f.agent_executor),balanceUnits:uint(typeof f.allowance_balance==='object'?moveFields(f.allowance_balance).value:f.allowance_balance),perTxUnits:uint(f.max_per_tx),dailyUnits:uint(f.daily_limit),expiresAtMs:timestamp(f.expires_at_ms),active:bool(f.active),epoch:uint(f.epoch),allowCreate:bool(f.allow_create),allowIncoming:bool(f.allow_incoming),allowCooldown:bool(f.allow_cooldown),payees:wallets(f.payees),history:f.history.map(h=>{const d=moveFields(h);return {atMs:timestamp(d.at_ms),amountUnits:uint(d.amount)};})};
}
export async function fetchPublicPreference(wallet:string,directory?:Fields):Promise<PublicSocialPreference|null>{
 const c=autopilotConfig();if(!c)return null;const d=directory||await autopilotObject(c.directoryId,'AgentDirectory'),value=await entry(d.social,requireAddress(wallet));if(value===null)return null;
 const id=uid(value),f=await autopilotObject(id,'PublicSocialProfile');if(f.owner!==wallet)throw Error('Public preference owner mismatch.');
 return {id,owner:wallet,active:bool(f.active),excludeAlcohol:bool(f.exclude_alcohol),vegetarian:bool(f.vegetarian),updatedAtMs:timestamp(f.updated_at_ms)};
}
export async function fetchGroupConvention(id:string):Promise<GroupConvention>{
 const f=await autopilotObject(requireAddress(id),'GroupConvention'),weights=moveFields(f.weights).contents,approvals=moveFields(f.approvals).contents;
 if(!Array.isArray(weights)||!Array.isArray(approvals)||weights.length<2||weights.length>65||weights.length!==approvals.length||typeof f.title!=='string')throw Error('Invalid group convention.');
 const a=new Map(approvals.map(x=>{const p=moveFields(x);return [requireAddress(p.key),bool(p.value)];}));
 const members=weights.map(x=>{const p=moveFields(x),wallet=requireAddress(p.key),weight=Number(uint(p.value));if(weight<1||weight>10000||!a.has(wallet))throw Error('Invalid group weight.');return {wallet,weight,approved:a.get(wallet)!};});
 if(new Set(members.map(m=>m.wallet)).size!==members.length||members.reduce((n,m)=>n+m.weight,0)!==10000||!members.some(m=>m.wallet===f.creator))throw Error('Invalid group membership.');
 return {id,creator:requireAddress(f.creator),title:f.title,updatedAtMs:timestamp(f.updated_at_ms),members};
}
export async function fetchAutopilotState(wallet:string):Promise<AutopilotState>{
 const c=autopilotConfig();if(!c)return {configured:false,reason:'The operator must deploy and configure the allowance extension.',vault:null,social:null,groups:[]};
 const d=await autopilotObject(c.directoryId,'AgentDirectory'),[vault,social,ids]=await Promise.all([fetchAgentAllowance(wallet,d),fetchPublicPreference(wallet,d),entry(d.groups,requireAddress(wallet),true)]);
 const groupIds=ids===null?[]:wallets(ids),events=await tatumSuiClient.queryEvents({query:{MoveEventType:c.origin+'::autopilot::GroupConventionCreatedEvent'},limit:50,order:'descending'});
 for(const e of events.data){const event=e.parsedJson as Fields;if(!Array.isArray(event.members)||!event.members.includes(wallet))continue;const id=requireAddress(event.group_id);if(!groupIds.includes(id)&&groupIds.length<84)groupIds.push(id);}
 const groups=await Promise.all(groupIds.map(fetchGroupConvention));if(groups.some(g=>!g.members.some(m=>m.wallet===wallet)))throw Error('Group directory membership mismatch.');
 return {configured:true,vault,social,groups};
}
export async function fetchAgentReceipt(vaultId:string,requestId:string){
 if(!/^[0-9a-f]{64}$/.test(requestId))throw Error('Invalid agent request ID.');
 const bytes=Array.from(Uint8Array.from(requestId.match(/../g)!,h=>parseInt(h,16)));
 const r=await tatumSuiClient.getDynamicFieldObject({parentId:vaultId,name:{type:'vector<u8>',value:bytes}});
 if(r.error?.code==='dynamicFieldNotFound')return null;
 if(r.error||r.data?.content?.dataType!=='moveObject'||normalizeStructTag(r.data.content.type)!==normalizeStructTag('0x2::dynamic_field::Field<vector<u8>,'+autopilotType('AgentReceipt')+'>'))throw Error('Agent receipt lookup failed.');
 const f=moveFields(r.data.content.fields),raw=typeof f.name==='string'?fromBase64(f.name):new Uint8Array(f.name as number[]);if(raw.length!==32||raw.some((b,i)=>b!==bytes[i]))throw Error('Agent receipt key mismatch.');
 const value=moveFields(f.value),digest=typeof value.digest==='string'?fromBase64(value.digest):new Uint8Array(value.digest as number[]);if(digest.length!==32)throw Error('Invalid receipt digest.');
 return {digest:toBase58(digest),objectId:uid(value.object_id),kind:Number(uint(value.kind)),amountUnits:uint(value.amount),atMs:timestamp(value.at_ms)};
}
async function ownerAccess(wallet:string,recovery=false){
 const [profile,memory]=await Promise.all([fetchFullUserStateViaTatum(wallet),fetchWalletMemWalAccount(wallet)]);
 const state=onboardingStatus(profile,memory);if(!(recovery?state.canRecover:state.ready))throw Error('Owned linked MemWal onboarding is required.');
 const config=autopilotConfig();if(!config)throw Error('Autopilot is not configured.');return {profile,memory:memory!,config};
}
export async function buildAgentAllowanceTx(wallet:string,p:AllowancePolicy,existing?:AgentAllowance|null){
 wallet=requireAddress(wallet);const deployment=autopilotConfig();if(!deployment)throw Error('Autopilot is not configured.');
 const executorError=executorSetupError(wallet,deployment.executor);if(executorError)throw Error(executorError);
 const {profile,memory,config}=await ownerAccess(wallet);validateAllowancePolicy(p,profile.contacts.map(c=>c.walletAddress),wallet,!existing);
 const current=await fetchAgentAllowance(wallet);
 if(!existing&&current)throw Error('An agent allowance already exists for this wallet. Refresh your account and choose Change policy or Top up.');
 if(existing&&(!current||current.id!==existing.id||existing.owner!==wallet))throw Error('The agent allowance changed. Refresh your account before reviewing its policy.');
 const tx=new Transaction();tx.setSender(wallet);const delegate=accountDelegateAddress();
 const chainClock=await tatumSuiClient.getObject({id:'0x6',options:{showContent:true}});if(chainClock.data?.content?.dataType!=='moveObject'||normalizeStructTag(chainClock.data.content.type)!==normalizeStructTag('0x2::clock::Clock'))throw Error('The Mainnet clock could not be read.');const expires=BigInt(uint(moveFields(chainClock.data.content.fields).timestamp_ms))+BigInt(p.days)*86400000n;
 const policyArgs=[tx.pure.address(config.executor),tx.pure.address(delegate),tx.pure.u64(positiveUsdc(p.perTx)),tx.pure.u64(positiveUsdc(p.daily)),tx.pure.u64(expires),tx.pure.bool(p.allowCreate),tx.pure.bool(p.allowIncoming),tx.pure.bool(p.allowCooldown),tx.pure.vector('address',p.payees),tx.object('0x6')];
 if(existing){if(existing.owner!==wallet)throw Error('Foreign allowance.');tx.moveCall({target:config.packageId+'::autopilot::configure_agent_vault',typeArguments:[SUI_MAINNET_USDC_TYPE],arguments:[tx.object(profile.profileId),tx.object(memory.accountId),tx.object(existing.id),...policyArgs]});}
 else{const reserve=await paymentCoins(wallet,positiveUsdc(p.budget)+usdcToUnits(profile.safeFloorUsdc),tx),[deposit]=tx.splitCoins(reserve,[tx.pure.u64(positiveUsdc(p.budget))]);tx.moveCall({target:config.packageId+'::autopilot::create_agent_allowance_vault',typeArguments:[SUI_MAINNET_USDC_TYPE],arguments:[tx.object(profile.profileId),tx.object(memory.accountId),tx.object(config.directoryId),deposit,reserve,...policyArgs]});}
 return tx;
}
// Derive the Sui address from the public delegate, never from a browser private key.
import {Ed25519PublicKey} from '@mysten/sui/keypairs/ed25519';
import {fromHex} from '@mysten/sui/utils';
export function accountDelegateAddress(){return new Ed25519PublicKey(fromHex(requireAddress(process.env.NEXT_PUBLIC_MEMWAL_AGENT_ID))).toSuiAddress();}
export async function buildManageAllowanceTx(wallet:string,vault:AgentAllowance,action:'revoke'|'withdraw'|'topup',amount?:string){
 const {profile,memory,config}=await ownerAccess(wallet,action!=='topup');if(vault.owner!==wallet)throw Error('Foreign allowance.');const tx=new Transaction();tx.setSender(wallet);
 if(action==='topup'){const units=positiveUsdc(amount||''),reserve=await paymentCoins(wallet,units+usdcToUnits(profile.safeFloorUsdc),tx),[funds]=tx.splitCoins(reserve,[tx.pure.u64(units)]);tx.moveCall({target:config.packageId+'::autopilot::top_up_agent_vault',typeArguments:[SUI_MAINNET_USDC_TYPE],arguments:[tx.object(profile.profileId),tx.object(memory.accountId),tx.object(vault.id),funds,reserve]});}
 else tx.moveCall({target:config.packageId+'::autopilot::'+(action==='revoke'?'revoke_agent_vault':'withdraw_from_agent_vault'),typeArguments:[SUI_MAINNET_USDC_TYPE],arguments:[tx.object(vault.id),...(action==='withdraw'?[tx.pure.u64(positiveUsdc(amount||''))]:[])]});return tx;
}
export async function buildPublicPreferenceTx(wallet:string,preference:PublicSocialPreference|null,settings:{excludeAlcohol:boolean;vegetarian:boolean}|null){
 const {profile,memory,config}=await ownerAccess(wallet,!settings),tx=new Transaction();tx.setSender(wallet);
 const name=!settings?'revoke_public_preferences':preference?'update_public_preferences':'create_public_preferences';
 if(!settings&&!preference)throw Error('No public preference exists.');
 tx.moveCall({target:config.packageId+'::autopilot::'+name,arguments:settings?[tx.object(profile.profileId),tx.object(memory.accountId),tx.object(preference?.id||config.directoryId),tx.pure.bool(settings.excludeAlcohol),tx.pure.bool(settings.vegetarian),tx.object('0x6')]:[tx.object(preference!.id)]});return tx;
}
export async function buildGroupConventionTx(wallet:string,p:{title:string;members:{wallet:string;weight:number}[]}){
 const {profile,memory,config}=await ownerAccess(wallet);if(!p.title.trim()||new TextEncoder().encode(p.title.trim()).length>120||p.members.length<2||p.members.length>65||!p.members.some(m=>m.wallet===wallet)||new Set(p.members.map(m=>m.wallet)).size!==p.members.length||p.members.some(m=>!Number.isInteger(m.weight)||m.weight<1||m.weight>10000||(m.wallet!==wallet&&!profile.contacts.some(c=>c.walletAddress===m.wallet)))||p.members.reduce((n,m)=>n+m.weight,0)!==10000)throw Error('Choose a title, actual contacts and percentages totaling exactly 100%.');
 const tx=new Transaction();tx.setSender(wallet);tx.moveCall({target:config.packageId+'::autopilot::create_group_convention',arguments:[tx.object(profile.profileId),tx.object(memory.accountId),tx.object(config.directoryId),tx.pure.string(p.title.trim()),tx.pure.vector('address',p.members.map(m=>m.wallet)),tx.pure.vector('u64',p.members.map(m=>m.weight)),tx.object('0x6')]});return tx;
}
export async function buildGroupConsentTx(wallet:string,groupId:string,accept:boolean){const {profile,memory,config}=await ownerAccess(wallet,!accept),tx=new Transaction();tx.setSender(wallet);tx.moveCall({target:config.packageId+'::autopilot::'+(accept?'consent_group_convention':'revoke_group_consent'),arguments:accept?[tx.object(profile.profileId),tx.object(memory.accountId),tx.object(config.directoryId),tx.object(requireAddress(groupId)),tx.pure.bool(true),tx.object('0x6')]:[tx.object(requireAddress(groupId))]});return tx;}
