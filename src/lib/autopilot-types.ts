export interface AgentAllowance {
 id:string;owner:string;profileId:string;memoryId:string;memoryDelegate:string;executor:string;balanceUnits:string;perTxUnits:string;dailyUnits:string;
 expiresAtMs:number;active:boolean;epoch:string;allowCreate:boolean;allowIncoming:boolean;allowCooldown:boolean;payees:string[];history:{atMs:number;amountUnits:string}[];
}
export interface PublicSocialPreference {id:string;owner:string;active:boolean;excludeAlcohol:boolean;vegetarian:boolean;updatedAtMs:number;}
export interface GroupConvention {id:string;creator:string;title:string;updatedAtMs:number;members:{wallet:string;weight:number;approved:boolean}[];}
export interface AutopilotState {configured:boolean;reason?:string;vault:AgentAllowance|null;social:PublicSocialPreference|null;groups:GroupConvention[];}
export interface AllowancePolicy {budget:string;perTx:string;daily:string;days:number;allowCreate:boolean;allowIncoming:boolean;allowCooldown:boolean;payees:string[];}
export interface AgentExecution {state:'confirmed'|'submitted'|'review_required';digest?:string;requestId:string;kind:string;warning?:string;}
export function rollingSpend(v:AgentAllowance,now=Date.now()){return v.history.filter(h=>now-h.atMs<86400000).reduce((n,h)=>n+BigInt(h.amountUnits),0n);}
export function allowanceRoom(v:AgentAllowance,now=Date.now()){const spent=rollingSpend(v,now),daily=BigInt(v.dailyUnits);return daily>spent?daily-spent:0n;}
export function agentSpendingSummary(v:AgentAllowance,now=Date.now()){
 const balance=BigInt(v.balanceUnits),daily=allowanceRoom(v,now),atActionLimit=v.history.filter(h=>now-h.atMs<86400000).length>=64;
 const available=!v.active||v.expiresAtMs<=now||atActionLimit?0n:balance<daily?balance:daily;
 return {balanceUnits:balance.toString(),availableUnits:available.toString(),perTxUnits:v.perTxUnits};
}
