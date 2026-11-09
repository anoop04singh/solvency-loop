import {encodeBillTitle,inferBillCategory,isBillCategory} from './bill-category';
import type {OnChainUserProfile,OnChainGroupSplit,OnChainCooldownVault} from './onchain-user-manager';
import type {RecalledMemory} from './memory-protocol';
import {requireAddress,CATEGORIES,type SolvencyNamespaceCategory} from './config';
import {positiveUsdc,usdcToUnits,unitsToUsdc,formatUsdc} from './money';
import {computeExpense,paymentPreferences,type ExpenseItem} from './expense';
import {spendingRoom,CHECKIN_DELAY_MS,MERCHANT_CATEGORIES,type VerifiedSettlement,type MerchantCategory} from './financial-insights';
import {checkInPurchases} from './bill-purchases';
import {allowanceRoom,type AgentAllowance,type GroupConvention,type PublicSocialPreference} from './autopilot-types';
import type {AgentAction} from './agent-types';
export interface AgentContext {autonomyRequested?:boolean;memoryAutomationRequested?:boolean;allowance?:AgentAllowance|null;groups?:GroupConvention[];publicPreferences?:PublicSocialPreference[];profile:OnChainUserProfile;memories:RecalledMemory[];verifiedSettlements:VerifiedSettlement[];splits:OnChainGroupSplit[];vaults:OnChainCooldownVault[];now:number;timeZone:string;}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The agent response is incomplete. Describe the request again.');return value as Record<string,unknown>;}
function text(value:unknown,label:string,max=120){if(typeof value!=='string'||!value.trim()||new TextEncoder().encode(value.trim()).length>max)throw new Error('Provide '+label+'.');return value.trim();}
function list(value:unknown,max=64){if(!Array.isArray(value)||value.length>max)throw new Error('The agent returned an invalid list. Try a smaller request.');return value;}
function amount(value:unknown){const s=text(value,'an explicit USDC amount',40);unitsToUsdc(positiveUsdc(s));return s;}
function contact(value:unknown,c:AgentContext){const name=text(value,'a saved contact',160).replace(/^@/,'').toLowerCase();const matches=c.profile.contacts.filter(p=>p.walletAddress===name||p.handle.replace(/^@/,'').toLowerCase()===name);if(matches.length!==1)throw new Error('Choose an unambiguous saved contact for “'+name+'”. Add their real wallet in Profile & contacts first.');return matches[0];}
function ownBill(id:unknown,c:AgentContext){const canonical=requireAddress(id,'Bill ID'),bill=c.splits.find(s=>s.splitId===canonical);if(!bill)throw new Error('Open that actual bill in the Escrow Desk first, then ask again.');return bill;}
export function prepareAgentAction(value:unknown,c:AgentContext):{action:AgentAction;reply:string}{
 const r=object(value),kind=text(r.action,'a supported action',30);
 if(r.currency&&r.currency!=='USDC')throw new Error('This application uses native Circle USDC only. Specify a USDC amount.');
 if(kind==='clarify'||kind==='explain')return {action:{kind:'none'},reply:text(r.reply,'a response',2400)};
 if(kind==='split'){
  if(r.includeCreator!==true)throw new Error('Should your wallet share this bill? The contract requires a positive creator share.');
  const people=list(r.people).map((value,i)=>{const p=object(value),saved=contact(p.contact,c);return {id:'agent-person-'+i,handle:saved.handle,walletAddress:saved.walletAddress,customAmount:p.amount===null||p.amount===undefined?'':amount(p.amount),upfront:p.upfront===true,excludeAlcohol:p.excludeAlcohol===true};});
  const total=amount(r.amount),title=r.title==null?'Shared expense':text(r.title,'a bill description'),all=[c.profile.wallet,...people.map(p=>p.walletAddress)];
  const items:ExpenseItem[]=list(r.items,30).map((value,i)=>{const item=object(value),kind=text(item.kind,'an item category',10);if(!['food','alcohol','other'].includes(kind))throw new Error('Choose food, alcohol or other for receipt items.');const selected=list(item.people).map(name=>String(name).toLowerCase()==='you'?c.profile.wallet:contact(name,c).walletAddress);return {id:'agent-item-'+i,label:text(item.label,'an item label',80),kind:kind as ExpenseItem['kind'],amount:amount(item.amount),wallets:(selected.length?selected:all).filter(wallet=>kind!=='alcohol'||!people.find(p=>p.walletAddress===wallet)?.excludeAlcohol)};});
  if(!items.length&&people.some(p=>p.excludeAlcohol))throw new Error('What were the food and alcohol amounts? I need the receipt breakdown to exclude drinks accurately.');
  if(!items.length&&/\b(drinks?|alcohol|bar|liquor)\b/i.test(title)&&people.some(p=>paymentPreferences(c.memories).get(p.walletAddress)?.excludeAlcohol||c.publicPreferences?.some(s=>s.active&&s.owner===p.walletAddress&&s.excludeAlcohol)))throw new Error('What were the food and alcohol amounts? A saved drinks exclusion needs exact receipt amounts.');
  const group=r.groupId?(c.groups||[]).find(g=>g.id===r.groupId&&g.members.every(m=>m.approved)):null;
  if(r.groupId&&!group)throw Error('That group convention is unavailable or awaits consent.');
  if(group){people.sort((a,b)=>group.members.findIndex(m=>m.wallet===a.walletAddress)-group.members.findIndex(m=>m.wallet===b.walletAddress));if(items.length||people.some(p=>p.customAmount)||group.members.length!==all.length||group.members.some(m=>!all.includes(m.wallet)))throw Error('Use the exact approved group for a conventional split, or specify a separate receipt/custom bill.');for(const p of people){const weight=group.members.find(m=>m.wallet===p.walletAddress)!.weight;p.customAmount=String(unitsToUsdc(positiveUsdc(total)*BigInt(weight)/10000n));}}
  const mode=items.length?'items':people.some(p=>p.customAmount)?'custom':'equal';
  const category = isBillCategory(r.billCategory) ? r.billCategory : inferBillCategory(title) ?? (items.some(item=>item.kind==='food'||item.kind==='alcohol')?'dining':'other');
  encodeBillTitle(title,category);
  const draft={title,total,mode,people,items,category,...(group?{conventionId:group.id}:{})} as const;
  const allocation=computeExpense(c.profile.wallet,people,total,mode,c.memories,true,{items,observations:c.verifiedSettlements,publicPreferences:c.publicPreferences});
  for(const share of allocation.shares){for(const item of items){if(item.kind==='alcohol'&&!item.wallets?.includes(share.walletAddress)&&!share.excludedItems.includes(item.label))share.excludedItems.push(item.label);}}
  return {action:{kind:'split',draft,allocation},reply:'I prepared this bill using your saved preferences and verified repayment history. Review the exact shares before wallet approval.'};
 }
 if(kind==='protect'){
  const value=amount(r.amount),unpaid=c.splits.filter(s=>!s.isCancelled).reduce((n,s)=>n+s.participants.filter(p=>p.debtor===c.profile.wallet&&!p.isSettled&&!p.isFunded).reduce((sum,p)=>sum+usdcToUnits(p.amountOwedUsdc),0n),0n);
  const room=spendingRoom(c.profile.usdcBalance,c.profile.safeFloorUsdc,unitsToUsdc(unpaid),c.memories,c.profile.wallet,c.now,c.timeZone);
  if(positiveUsdc(value)>usdcToUnits(room.available)&&!canFund(c,positiveUsdc(value),'protect'))throw new Error('That amount exceeds your live balance after the reserve and loaded unpaid shares. Choose a smaller amount.');
  return {action:{kind:'protect',amount:value},reply:'Review a 24-hour lock of '+value+' USDC. Your registered reserve stays available. SUI pays gas.'};
 }
 if(['settle','fund','activate','cancel','refund'].includes(kind)){
  const ids=list(r.ids,20);if(!ids.length||new Set(ids).size!==ids.length||(kind!=='settle'&&ids.length!==1))throw new Error('Choose the actual bill or distinct bills to review.');
  const bills=ids.map(id=>ownBill(id,c));let sum=0n;
  for(const bill of bills){const share=bill.participants.find(p=>p.debtor===c.profile.wallet),expired=c.now>bill.fundingDeadlineMs;
   if(kind==='settle'&&(!share||share.isSettled||!bill.isActive||bill.isCancelled))throw new Error('Only your active unpaid shares can be settled.');
   if(kind==='fund'&&(!share||!share.requiresUpfrontEscrow||share.isFunded||share.isSettled||bill.isActive||bill.isCancelled||expired))throw new Error('That bill has no eligible upfront deposit for your wallet.');
   if(kind==='refund'&&(!share||!share.isFunded||share.isSettled||bill.isActive||(!bill.isCancelled&&!expired)))throw new Error('Your escrow is not eligible for a refund.');
   if((kind==='activate'||kind==='cancel')&&(bill.creator!==c.profile.wallet||bill.isActive||bill.isCancelled||(kind==='activate'&&(bill.pendingUpfront!==0||expired))))throw new Error('Only the creator can perform this action on an eligible pending bill.');
   if(share)sum+=positiveUsdc(share.amountOwedUsdc);
  }
  if((kind==='settle'||kind==='fund')&&sum>usdcToUnits(c.profile.usdcBalance)&&!canFund(c,sum,'pay',bills.map(b=>b.creator)))throw new Error('Your current native Circle USDC balance is insufficient.');
  const value=String(unitsToUsdc(sum));
  return {action:kind==='settle'?{kind:'settle',splitIds:bills.map(b=>b.splitId),amount:value}:kind==='fund'?{kind:'fund',splitId:bills[0].splitId,amount:value}:{kind:kind as 'activate'|'cancel'|'refund',splitId:bills[0].splitId},reply:'Prepared '+kind+' for your connected wallet. The contract rechecks eligibility and your wallet must approve.'};
 }
 if(kind==='unlock'){
  const ids=list(r.ids,1),id=requireAddress(ids[0],'Vault ID'),vault=c.vaults.find(v=>v.vaultId===id);if(!vault||c.now<vault.unlockTimeMs)throw new Error('Choose an owned vault whose 24-hour cooldown has matured.');
  return {action:{kind:'unlock',vaultId:id,amount:String(vault.amountUsdc)},reply:'This owned vault has matured. Review its withdrawal in your wallet.'};
 }
 if(kind==='purchase'){
  const merchant=text(r.title,'the actual merchant'),value=amount(r.amount),category=text(r.category,'a purchase category',30) as MerchantCategory;if(!MERCHANT_CATEGORIES.includes(category))throw new Error('Choose a supported purchase category.');
  const purchasedAtMs=r.when==='now'?c.now:r.when==='yesterday'?c.now-86400000:r.when==='48h_ago'?c.now-CHECKIN_DELAY_MS:r.when==='custom'?Number(r.purchasedAtMs):NaN;
  if(!Number.isSafeInteger(purchasedAtMs)||purchasedAtMs<=0||purchasedAtMs>c.now||purchasedAtMs<c.now-365*86400000)throw new Error('When did the purchase happen? Choose an actual time within the past year.');
  return {action:{kind:'memory',payload:{action:'record_purchase',merchant,merchantCategory:category,amountUsdc:value,purchasedAtMs,timeZone:c.timeZone},summary:merchant+' · '+value+' USDC · '+new Date(purchasedAtMs).toISOString()},reply:'Review this self-reported purchase. It is not an on-chain merchant payment. Your check-in opens 48 hours after the purchase.'};
 }
 if(kind==='checkin'){
  const ids=list(r.ids,1),purchase=checkInPurchases(c.memories,c.profile.wallet,c.splits).find(p=>p.id===ids[0]);if(!purchase||c.now<purchase.purchasedAtMs+CHECKIN_DELAY_MS)throw new Error('Choose an owned tracked purchase or created bill that is at least 48 hours old.');
  if(!['regretted','worth_it'].includes(String(r.verdict))||(r.verdict==='regretted'&&(!Number.isInteger(r.intensity)||Number(r.intensity)<1||Number(r.intensity)>5)))throw new Error('Was it worth it or regretted? For regret, choose an intensity from 1 to 5.');
  return {action:{kind:'memory',payload:{action:'regret_checkin',purchaseId:purchase.id,...(purchase.splitId?{splitId:purchase.splitId,timeZone:c.timeZone}:{}),verdict:r.verdict as 'regretted'|'worth_it',intensity:r.verdict==='regretted'?Number(r.intensity):0},summary:purchase.merchant+' · '+String(r.verdict)+(r.verdict==='regretted'?' · '+r.intensity+'/5':'')},reply:'Review this check-in before saving it to your owned habit and cash-flow memory.'};
 }
 if(kind==='preference'){
  const saved=contact(r.subject,c),existing=paymentPreferences(c.memories).get(saved.walletAddress),threshold=r.threshold===null||r.threshold===undefined?unitsToUsdc(existing?.threshold??40_000_000n):unitsToUsdc(usdcToUnits(text(r.threshold,'a funding threshold',40))),policy=r.policy??existing?.fundingPolicy??'adaptive';
  if(!['always','adaptive','never'].includes(String(policy))||(r.excludeAlcohol!==null&&r.excludeAlcohol!==undefined&&typeof r.excludeAlcohol!=='boolean'))throw new Error('Choose a supported alcohol and payment preference.');
  const excludeAlcohol=typeof r.excludeAlcohol==='boolean'?r.excludeAlcohol:existing?.excludeAlcohol??false;
  return {action:{kind:'memory',payload:{action:'save_preference',subjectWallet:saved.walletAddress,upfrontAboveUsdc:threshold,excludeAlcohol,fundingPolicy:policy as 'always'|'adaptive'|'never'},summary:saved.handle+' · '+(excludeAlcohol?'Alcohol excluded':'Alcohol shared')+' · '+policy+' funding above '+formatUsdc(threshold)+' USDC'},reply:'Review this lasting payment preference. Unspecified funding choices retain the saved policy or the application’s adaptive default.'};
 }
 if(kind==='note'){
  const note=text(r.subject,'the fact to remember',3000),category=text(r.category,'a memory category',40) as SolvencyNamespaceCategory;
  if(!CATEGORIES.includes(category))throw new Error('Choose a supported memory category.');
  if(/SOLVENCY_[A-Z0-9_]+/.test(note))throw new Error('Use the structured preference or financial action for application records. Personal notes cannot create payment proof or rules.');
  return {action:{kind:'memory',payload:{action:'remember',category,text:note},summary:note},reply:'Review this personal note before saving it to your owned memory. It is self-reported context, not verified payment proof.'};
 }
 if(kind==='contact'){
  const wallet=requireAddress(r.wallet,'Contact wallet'),handle=text(r.handle,'the contact name',64);if(wallet===c.profile.wallet||c.profile.contacts.some(p=>p.walletAddress===wallet)||c.profile.contacts.length>=64)throw new Error('Use a distinct new contact wallet; at most 64 contacts can be saved.');
  return {action:{kind:'contact',handle,walletAddress:wallet},reply:'Review this public contact before saving it to your on-chain profile.'};
 }
 throw new Error('Ask for a split, a vault action, your own settlement, a purchase, a check-in, a contact or a payment preference.');
}
function canFund(c:AgentContext,amount:bigint,kind:'pay'|'protect',payees:string[]=[]){const v=c.allowance;return !!v&&v.owner===c.profile.wallet&&v.profileId===c.profile.profileId&&v.memoryId===c.profile.memwalAccountId&&v.active&&v.expiresAtMs>c.now&&amount<=BigInt(v.balanceUnits)&&amount<=allowanceRoom(v,c.now)&&(kind!=='protect'||v.allowCooldown)&&payees.every(p=>v.payees.includes(p));}
