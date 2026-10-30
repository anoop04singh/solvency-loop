import { allocateUnits, unitsToUsdc, usdcToUnits } from './money';
import { requireAddress } from './config';
import type { RecalledMemory } from './memory-protocol';
export interface ComputedParticipantShare { handle: string; walletAddress: string; amountUsdc: number; requiresUpfrontEscrow: boolean; ruleApplied: string; }
export interface SavedRule { subject: string; excludeAlcohol?: boolean; upfrontAboveUsdc?: number; }
export function savedRules(memories: RecalledMemory[]): SavedRule[] {
  return memories.flatMap(m => {
    const match = m.text.match(/SOLVENCY_RULE_V1 (\{[^\n]+?\})/);
    if (!match) return [];
    try {
      const r = JSON.parse(match[1]) as SavedRule;
      requireAddress(r.subject);
      if (r.upfrontAboveUsdc !== undefined) usdcToUnits(r.upfrontAboveUsdc);
      return [r];
    } catch { return []; }
  });
}
export function computeSplit(owner: string, friends: { handle: string; walletAddress: string }[], food: number, drinks: number, memories: RecalledMemory[], enabled: boolean) {
  const wallets = [requireAddress(owner), ...friends.map(f => requireAddress(f.walletAddress))];
  if (wallets.length !== 4 || new Set(wallets).size !== 4) throw new Error('Enter three distinct friend wallets, different from yours.');
  const rules = enabled ? [...learnedSettlementRules(memories), ...savedRules(memories)] : [];
  const foodParts = allocateUnits(usdcToUnits(food), wallets.length);
  const eligible = wallets.map((wallet, i) => ({ wallet, i })).filter(({ wallet }) => !rules.some(r => r.subject === wallet && r.excludeAlcohol === true));
  if (!eligible.length && usdcToUnits(drinks) > 0n) throw new Error('No participant can be assigned the drinks subtotal.');
  const drinkParts = eligible.length ? allocateUnits(usdcToUnits(drinks), eligible.length) : [];
  const totals = foodParts.map((v, i) => v + (drinkParts[eligible.findIndex(e => e.i === i)] || 0n));
  if (totals.some(v => v <= 0n)) throw new Error('Every participant must have a positive share (at least 0.000001 USDC).');
  const shares: ComputedParticipantShare[] = friends.map((f, i) => {
    const rule = rules.filter(r => r.subject === f.walletAddress.toLowerCase()).reduce<SavedRule>((all, r) => ({ ...all, ...r }), { subject: f.walletAddress.toLowerCase() });
    const escrow = rule?.upfrontAboveUsdc !== undefined && totals[i + 1] > usdcToUnits(rule.upfrontAboveUsdc);
    return { ...f, amountUsdc: unitsToUsdc(totals[i + 1]), requiresUpfrontEscrow: escrow,
      ruleApplied: rule?.excludeAlcohol ? 'Alcohol excluded by saved rule' : escrow ? 'Upfront funding required by saved rule' : 'Standard share' };
  });
  return { shares, creatorShare: unitsToUsdc(totals[0]), total: unitsToUsdc(usdcToUnits(food) + usdcToUnits(drinks)) };
}

// Store genuine timing observations as rules only after they have been verified
// by the memory service; explicit saved preferences remain independently usable.
export function learnedSettlementRules(memories: RecalledMemory[]): SavedRule[] {
  const observations = new Map<string, { total: number; count: number }>();
  const seen = new Set<string>();
  for (const m of memories) {
    const match = m.text.match(/SOLVENCY_SETTLEMENT_V1 (\{[^\n]+?\})/);
    if (!match) continue;
    try {
      const f = JSON.parse(match[1]) as { subject: string; digest: string; lagMs: number };
      const subject = requireAddress(f.subject);
      if (!Number.isSafeInteger(f.lagMs) || f.lagMs < 0 || typeof f.digest !== 'string' || seen.has(f.digest + subject)) continue;
      seen.add(f.digest + subject);
      const prior = observations.get(subject) || { total: 0, count: 0 };
      observations.set(subject, { total: prior.total + f.lagMs, count: prior.count + 1 });
    } catch { /* Ordinary notes are not structured timing observations. */ }
  }
  return [...observations].flatMap(([subject, observation]) => observation.total / observation.count > 7 * 86_400_000 ? [{ subject, upfrontAboveUsdc: 40 }] : []);
}
