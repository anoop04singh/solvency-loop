import { requireAddress } from './config';
import { allocateUnits, positiveUsdc, unitsToUsdc, usdcToUnits } from './money';
import { settlementSummary, type VerifiedSettlement } from './financial-insights';
import type { RecalledMemory } from './memory-protocol';
import type {PublicSocialPreference} from './autopilot-types';

export interface ExpensePerson { id:string; handle:string; walletAddress:string; customAmount:string; upfront:boolean; }
export type ExpenseMode='equal'|'items'|'custom';
export interface ExpenseItem { id:string; label:string; kind:'food'|'alcohol'|'other'; amount:string; wallets?:string[]; }
export interface ExpenseShare { handle:string; walletAddress:string; amountUsdc:number; requiresUpfrontEscrow:boolean; ruleApplied:string; excludedItems:string[]; history:ReturnType<typeof settlementSummary>; }
export function paymentPreferences(memories:RecalledMemory[]) {
  const rules=new Map<string,{threshold:bigint;updated:number;excludeAlcohol:boolean;fundingPolicy:'always'|'adaptive'|'never'}>();
  for(const memory of memories){
    if(memory.namespace.endsWith('_observations')||memory.category!=='social_split_trust'||/^Demo\b/i.test(memory.text))continue;
    const match=memory.text.match(/SOLVENCY_RULE_V1 (\{[^\n]+?\})/);if(!match)continue;
    try{
      const r=JSON.parse(match[1]) as {subject:string;upfrontAboveUsdc?:number;updatedAtMs?:number;excludeAlcohol?:boolean;fundingPolicy?:'always'|'adaptive'|'never'};
      const subject=requireAddress(r.subject);if(r.upfrontAboveUsdc===undefined)continue;
      const threshold=usdcToUnits(r.upfrontAboveUsdc),updated=Number(r.updatedAtMs||0),fundingPolicy=r.fundingPolicy||'always';
      if(!Number.isSafeInteger(updated)||updated<0||!['always','adaptive','never'].includes(fundingPolicy)||(r.excludeAlcohol!==undefined&&typeof r.excludeAlcohol!=='boolean'))continue;
      if(!rules.has(subject)||updated>rules.get(subject)!.updated)rules.set(subject,{threshold,updated,excludeAlcohol:r.excludeAlcohol===true,fundingPolicy});
    }catch{/* Unstructured notes and invalid rules never become financial instructions. */}
  }return rules;
}
export function computeExpense(owner:string,people:ExpensePerson[],totalAmount:string,mode:ExpenseMode,memories:RecalledMemory[],usePreferences:boolean,context:{items?:ExpenseItem[];observations?:VerifiedSettlement[];publicPreferences?:PublicSocialPreference[]}={}) {
  const wallet=requireAddress(owner),addresses=people.map(p=>requireAddress(p.walletAddress,'Participant wallet'));
  if(!people.length||people.length>64)throw new Error('Add between 1 and 64 other participants.');
  if(new Set([wallet,...addresses]).size!==people.length+1)throw new Error('Each participant needs a different wallet, separate from yours.');
  if(people.some(p=>!p.handle.trim()))throw new Error('Give each participant a name.');
  const total=positiveUsdc(totalAmount),preferences=paymentPreferences(usePreferences?memories:[]);
  let units:bigint[],creator:bigint;
  const excluded=new Map(addresses.map(address=>[address,[] as string[]]));
  if(mode==='items'){
    const items=context.items||[];if(!items.length||items.length>30)throw new Error('Add between 1 and 30 receipt items.');
    const all=[wallet,...addresses],allocated=new Map(all.map(address=>[address,0n]));let itemTotal=0n;
    for(const item of items){
      if(!item.label.trim()||item.label.length>80||!['food','alcohol','other'].includes(item.kind))throw new Error('Give every receipt item a valid category and name.');
      const amount=positiveUsdc(item.amount);itemTotal+=amount;
      const chosen=item.wallets?item.wallets.map(address=>requireAddress(address)):[...all];
      if(new Set(chosen).size!==chosen.length||chosen.some(address=>!all.includes(address)))throw new Error('An item can only be shared by people on this bill.');
      const eligible=chosen.filter(address=>{
        const omit=item.kind==='alcohol'&&(!!preferences.get(address)?.excludeAlcohol||!!context.publicPreferences?.some(p=>p.active&&p.owner===address&&p.excludeAlcohol));
        if(omit&&excluded.has(address))excluded.get(address)!.push(item.label);
        return !omit;
      }).sort();
      if(!eligible.length)throw new Error('At least one person must share '+item.label+'.');
      allocateUnits(amount,eligible.length).forEach((share,index)=>allocated.set(eligible[index],allocated.get(eligible[index])!+share));
    }
    if(itemTotal!==total)throw new Error('Receipt items must add up exactly to the total bill.');
    units=addresses.map(address=>allocated.get(address)!);creator=allocated.get(wallet)!;
  }else{
    const equal=allocateUnits(total,people.length+1);
    units=mode==='equal'?equal.slice(1):people.map(p=>positiveUsdc(p.customAmount));
    creator=total-units.reduce((sum,amount)=>sum+amount,0n);
  }
  if(creator<=0n||units.some(amount=>amount<=0n))throw new Error('Every share, including yours, must be at least 0.000001 USDC. Remove anyone who shares no items.');
  const shares:ExpenseShare[]=people.map((person,index)=>{
    const preference=preferences.get(addresses[index]),threshold=preference?.threshold??40_000_000n;
    const policy=preference?.fundingPolicy||'adaptive';
    const history=settlementSummary(usePreferences?context.observations||[]:[],wallet,addresses[index],unitsToUsdc(threshold));
    const manualRule=usePreferences&&policy==='always'&&units[index]>threshold;
    const adaptive=usePreferences&&policy==='adaptive'&&units[index]>threshold&&history.recommendation==='upfront';
    const requiresUpfrontEscrow=person.upfront||manualRule||adaptive;
    const reason=person.upfront?'Upfront funding selected':manualRule?'Your saved payment preference':adaptive?'Verified late-payment history':usePreferences&&policy==='adaptive'&&history.recommendation==='standard'?'Recent verified payments support standard settlement':'Standard settlement';
    return {handle:person.handle.trim(),walletAddress:addresses[index],amountUsdc:unitsToUsdc(units[index]),requiresUpfrontEscrow,ruleApplied:reason,excludedItems:excluded.get(addresses[index])||[],history};
  });
  return {total:unitsToUsdc(total),creatorShare:unitsToUsdc(creator),shares};
}
