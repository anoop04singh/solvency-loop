export function usdcToUnits(value: number | string): bigint {
  const s = String(value);
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error('USDC amounts must be nonnegative with at most six decimals.');
  const [whole, fraction = ''] = s.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (units > 18_446_744_073_709_551_615n) throw new Error('USDC amount exceeds u64.');
  return units;
}
export function positiveUsdc(value: number | string) { const units = usdcToUnits(value); if (units === 0n) throw new Error('Amount must be greater than zero.'); return units; }
export function unitsToUsdc(value: bigint | string) {
  const units = BigInt(value);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Balance is too large to display safely.');
  return Number(units) / 1e6;
}
// Allocate the remainder in deterministic wallet order; no lost or created micro-USDC.
export function allocateUnits(total: bigint, count: number): bigint[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('At least one participant is required.');
  return Array.from({ length: count }, (_, i) => total / BigInt(count) + (BigInt(i) < total % BigInt(count) ? 1n : 0n));
}
export function formatUsdc(value: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value); }
export function spendableUsdc(balance: number, floor: number) {
  const available = usdcToUnits(balance) - usdcToUnits(floor);
  return unitsToUsdc(available > 0n ? available : 0n);
}
