import { requireAddress } from './config';
import { usdcToUnits, unitsToUsdc } from './money';
import type { RecalledMemory } from './memory-protocol';

export const DAY_MS = 86_400_000;
export const CHECKIN_DELAY_HOURS = 6;
export const CHECKIN_DELAY_MS = CHECKIN_DELAY_HOURS * 60 * 60 * 1000;
export const MERCHANT_CATEGORIES = ['food_delivery', 'dining', 'groceries', 'shopping', 'entertainment', 'travel', 'housing', 'utilities', 'workspace', 'other'] as const;
export type MerchantCategory = typeof MERCHANT_CATEGORIES[number];
export const categoryLabels: Record<MerchantCategory,string> = {food_delivery:'Food delivery',dining:'Food & dining',groceries:'Groceries',shopping:'Shopping',entertainment:'Entertainment',travel:'Travel',housing:'Housing',utilities:'Utilities & subscriptions',workspace:'Work & learning',other:'Something else'};
export interface PurchaseMemory { id:string; owner:string; merchant:string; category:MerchantCategory; amountUnits:string; purchasedAtMs:number; timeZone:string; localHour:number; recordedAtMs:number; checkpoint:string; balanceUnits:string; splitId?:string; }
export interface RegretMemory extends PurchaseMemory { verdict:'regretted'|'worth_it'; intensity:number; checkedAtMs:number; }
export interface CashflowMemory { purchaseId:string; owner:string; localHour:number; regretScore:number; balanceUnits:string; floorUnits:string; checkedAtMs:number; checkpoint:string; }
export interface VerifiedSettlement { digest:string; eventSeq:string; splitId:string; payer:string; recipient:string; amountUnits:string; createdAtMs:number; settledAtMs:number; lagMs:number; checkpoint:string; network?:boolean; }
export interface MemoryInsights { memories:RecalledMemory[]; verifiedSettlements:VerifiedSettlement[]; rejectedEvidenceCount:number; publicPreferences?:import('./autopilot-types').PublicSocialPreference[]; }
export function memoryRecord(text:string, marker:string):Record<string,unknown>|null {
  const index=text.indexOf(marker+' ');if(index<0||/^Demo\b/i.test(text))return null;
  try { const value=JSON.parse(text.slice(index+marker.length+1));return value&&typeof value==='object'&&!Array.isArray(value)?value:null; } catch { return null; }
}
function timestamp(value:unknown):value is number {return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;}
function units(value:unknown):value is string {return typeof value==='string'&&/^\d{1,20}$/.test(value)&&BigInt(value)>0n&&BigInt(value)<=18_446_744_073_709_551_615n;}
function owned(value:unknown,wallet:string){try{return requireAddress(value)===requireAddress(wallet);}catch{return false;}}
function validPurchaseSource(r:Record<string,unknown>){try{return r.splitId===undefined||requireAddress(r.splitId).slice(2)===r.id;}catch{return false;}}
export function localHour(at:number,timeZone:string) {return Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(new Date(at)));}
export function purchaseMemories(memories:RecalledMemory[],wallet:string):PurchaseMemory[] {
  const records=new Map<string,PurchaseMemory>();
  for(const memory of memories){if(memory.category!=='habit_regret')continue;const r=memoryRecord(memory.text,'SOLVENCY_PURCHASE_V1');
    if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(r.id)||!owned(r.owner,wallet)||typeof r.merchant!=='string'||!r.merchant.trim()||!MERCHANT_CATEGORIES.includes(r.category as MerchantCategory)||!units(r.amountUnits)||!timestamp(r.purchasedAtMs)||!timestamp(r.recordedAtMs)||typeof r.timeZone!=='string'||!Number.isInteger(r.localHour)||Number(r.localHour)<0||Number(r.localHour)>23)continue;
    if(!validPurchaseSource(r))continue;
    const previous=records.get(r.id);if(!previous||previous.recordedAtMs<Number(r.recordedAtMs))records.set(r.id,r as unknown as PurchaseMemory);
  }return [...records.values()].sort((a,b)=>b.purchasedAtMs-a.purchasedAtMs);
}
export function regretMemories(memories:RecalledMemory[],wallet:string):RegretMemory[] {
  const records=new Map<string,RegretMemory>();
  for(const memory of memories){if(memory.category!=='habit_regret')continue;const r=memoryRecord(memory.text,'SOLVENCY_REGRET_V1');
    if(!r||!owned(r.owner,wallet)||typeof r.id!=='string'||!units(r.amountUnits)||!timestamp(r.purchasedAtMs)||!timestamp(r.checkedAtMs)||Number(r.checkedAtMs)<Number(r.purchasedAtMs)+CHECKIN_DELAY_MS||!Number.isInteger(r.localHour)||Number(r.localHour)<0||Number(r.localHour)>23||!MERCHANT_CATEGORIES.includes(r.category as MerchantCategory)||!['regretted','worth_it'].includes(String(r.verdict))||!Number.isInteger(r.intensity)||Number(r.intensity)<0||Number(r.intensity)>5||(r.verdict==='regretted'&&Number(r.intensity)<1)||(r.verdict==='worth_it'&&r.intensity!==0))continue;
    if(!validPurchaseSource(r))continue;
    const previous=records.get(r.id);if(!previous||previous.checkedAtMs<Number(r.checkedAtMs))records.set(r.id,r as unknown as RegretMemory);
  }return [...records.values()].sort((a,b)=>b.checkedAtMs-a.checkedAtMs);
}
export function settlementSummary(observations:VerifiedSettlement[],wallet:string,subject:string,threshold=40) {
  const cutoff=usdcToUnits(threshold),unique=new Map<string,VerifiedSettlement>();
  for(const event of observations){if((event.recipient!==wallet&&event.network!==true)||event.payer!==subject||!units(event.amountUnits)||BigInt(event.amountUnits)<=cutoff||!timestamp(event.createdAtMs)||!timestamp(event.settledAtMs)||event.settledAtMs<event.createdAtMs||event.lagMs!==event.settledAtMs-event.createdAtMs)continue;unique.set(event.digest+':'+event.eventSeq,event);}
  const recent=[...unique.values()].sort((a,b)=>b.settledAtMs-a.settledAtMs).slice(0,5);
  const averageLagMs=recent.length?recent.reduce((n,e)=>n+e.lagMs,0)/recent.length:0;
  return {count:recent.length,averageLagMs,onTimeRate:recent.length?Math.round(100*recent.filter(e=>e.lagMs<=DAY_MS).length/recent.length):null,
    recommendation:recent.length<3?'insufficient':averageLagMs>7*DAY_MS?'upfront':averageLagMs<=DAY_MS?'standard':'review'} as const;
}
export function spendingRoom(balance:number,floor:number,unpaid:number,memories:RecalledMemory[],wallet:string,now=Date.now(),timeZone='UTC') {
  const total=usdcToUnits(balance),requestedFloor=usdcToUnits(floor),reserve=requestedFloor<total?requestedFloor:total;
  const afterReserve=total-reserve,requestedBills=usdcToUnits(unpaid),bills=requestedBills<afterReserve?requestedBills:afterReserve,available=afterReserve-bills;
  const hour=localHour(now,timeZone),distance=(other:number)=>Math.min(Math.abs(hour-other),24-Math.abs(hour-other));
  const ratings=regretMemories(memories,wallet).filter(r=>r.purchasedAtMs>=now-90*DAY_MS&&r.checkedAtMs<=now&&distance(r.localHour)<=1);
  const regretted=ratings.filter(r=>r.verdict==='regretted'),highRegret=ratings.length>=3&&regretted.length>=2&&regretted.length*3>=ratings.length*2;
  let shield=0n,elasticityApplied=false;
  if(highRegret){const amounts=regretted.map(r=>BigInt(r.amountUnits)).sort((a,b)=>a<b?-1:a>b?1:0);shield=amounts[Math.floor(amounts.length/2)];
    const cashflows=new Map<string,CashflowMemory>();
    for(const memory of memories){if(memory.category!=='cashflow_elasticity')continue;const r=memoryRecord(memory.text,'SOLVENCY_CASHFLOW_V1');if(!r||!owned(r.owner,wallet)||typeof r.purchaseId!=='string'||!units(r.balanceUnits)||!timestamp(r.checkedAtMs)||Number(r.checkedAtMs)>now||!regretted.some(c=>c.id===r.purchaseId)||!Number.isInteger(r.regretScore)||Number(r.regretScore)<1||Number(r.regretScore)>5)continue;const old=cashflows.get(r.purchaseId);if(!old||old.checkedAtMs<Number(r.checkedAtMs))cashflows.set(r.purchaseId,r as unknown as CashflowMemory);}
    const samples=[...cashflows.values()];if(samples.length>=2){const baseline=samples.reduce((n,r)=>n+BigInt(r.balanceUnits),0n)/BigInt(samples.length);if(total*4n<baseline*3n){shield=shield*5n/4n;elasticityApplied=true;}}
    if(shield>available)shield=available;
  }
  return {balance,reserve:unitsToUsdc(reserve),unpaid:unitsToUsdc(bills),available:unitsToUsdc(available),shield:unitsToUsdc(shield),quota:unitsToUsdc(available-shield),highRegret,sampleCount:ratings.length,regrettedCount:regretted.length,elasticityApplied,hour};
}
