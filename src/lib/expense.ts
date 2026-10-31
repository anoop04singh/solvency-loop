import { requireAddress } from './config';
import { allocateUnits, positiveUsdc, unitsToUsdc, usdcToUnits } from './money';
import type { RecalledMemory } from './memory-protocol';

export interface ExpensePerson { id: string; handle: string; walletAddress: string; customAmount: string; upfront: boolean; }
export interface ExpenseShare { handle: string; walletAddress: string; amountUsdc: number; requiresUpfrontEscrow: boolean; ruleApplied: string; }
export function paymentPreferences(memories: RecalledMemory[]) {
  const rules = new Map<string, { threshold: bigint; updated: number }>();
  for (const memory of memories) {
    if (/^Demo\b/i.test(memory.text)) continue;
    const match = memory.text.match(/SOLVENCY_RULE_V1 (\{[^\n]+?\})/); if (!match) continue;
    try {
      const r = JSON.parse(match[1]) as { subject: string; upfrontAboveUsdc?: number; updatedAtMs?: number };
      const subject = requireAddress(r.subject); if (r.upfrontAboveUsdc === undefined) continue;
      const threshold = usdcToUnits(r.upfrontAboveUsdc), updated = Number(r.updatedAtMs || 0);
      if (!Number.isSafeInteger(updated) || updated < 0) continue;
      if (!rules.has(subject) || updated > rules.get(subject)!.updated) rules.set(subject, { threshold, updated });
    } catch { /* Free-form memories are never financial instructions. */ }
  }
  return rules;
}
export function computeExpense(owner: string, people: ExpensePerson[], totalAmount: string, mode: 'equal'|'custom', memories: RecalledMemory[], usePreferences: boolean) {
  const wallet = requireAddress(owner), addresses = people.map(p=>requireAddress(p.walletAddress,'Participant wallet'));
  if (!people.length || people.length > 64) throw new Error('Add between 1 and 64 other participants.');
  if (new Set([wallet,...addresses]).size !== people.length + 1) throw new Error('Each participant needs a different wallet, separate from yours.');
  if (people.some(p=>!p.handle.trim())) throw new Error('Give each participant a name.');
  const total=positiveUsdc(totalAmount), equal=allocateUnits(total,people.length+1);
  const units = mode === 'equal' ? equal.slice(1) : people.map(p=>positiveUsdc(p.customAmount));
  const creator = total - units.reduce((a,b)=>a+b,0n);
  if (creator <= 0n || units.some(u=>u<=0n)) throw new Error('Every share, including yours, must be at least 0.000001 USDC.');
  const preferences=usePreferences?paymentPreferences(memories):new Map();
  const shares:ExpenseShare[]=people.map((p,i)=>{
    const preference=preferences.get(addresses[i]), recommended=!!preference && units[i] > preference.threshold;
    return {handle:p.handle.trim(),walletAddress:addresses[i],amountUsdc:unitsToUsdc(units[i]),requiresUpfrontEscrow:p.upfront||recommended,ruleApplied:p.upfront?'Upfront funding selected':recommended?'Your saved payment preference':'Standard settlement'};
  });
  return {total:unitsToUsdc(total),creatorShare:unitsToUsdc(creator),shares};
}
