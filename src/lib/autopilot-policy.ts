import {requireAddress} from './config';
import {positiveUsdc,usdcToUnits} from './money';
import type {AllowancePolicy} from './autopilot-types';

export function executorSetupError(owner:string,executor:string){
 if(requireAddress(owner)===requireAddress(executor,'Agent executor'))return 'This wallet is configured as the agent executor. Autopilot requires a separate dedicated executor wallet. Ask the app operator to update the executor configuration before enabling Autopilot for this wallet.';
 return '';
}
export function validateAllowancePolicy(p:AllowancePolicy,contacts:string[],wallet:string,deposit=true){
 if(deposit)positiveUsdc(p.budget);
 const per=positiveUsdc(p.perTx),daily=positiveUsdc(p.daily);
 if(daily<per)throw Error('The rolling 24-hour limit must be at least the per-transaction limit.');
 if(!Number.isInteger(p.days)||p.days<1||p.days>30)throw Error('Choose a consent duration from 1 to 30 days.');
 if(p.payees.length>64||new Set(p.payees).size!==p.payees.length||p.payees.some(a=>requireAddress(a)===wallet||!contacts.includes(a)))throw Error('Choose up to 64 distinct saved counterparties.');
 if((p.allowCreate||p.allowIncoming)&&!p.payees.length)throw Error('Select counterparties before enabling bill creation or incoming payments.');
 if(!p.allowCooldown&&!p.allowCreate&&!p.payees.length)throw Error('Choose at least one agent permission.');
}
export function validateAllowanceFunding(budget:string,balance:number,floor:number){
 if(positiveUsdc(budget)+usdcToUnits(floor)>usdcToUnits(balance))throw Error('Reduce the deposit to keep your USDC reserve available in your wallet.');
}
