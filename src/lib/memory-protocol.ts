import { usdcToUnits } from './money';
import { CATEGORIES, requireAddress, type SolvencyNamespaceCategory } from './config';
export type MemoryAction = 'recall_all' | 'remember' | 'analyze' | 'restore' | 'save_preference' | 'settlement' | 'sync_settlements';
export interface SettlementCursor { txDigest: string; eventSeq: string; cursor?: string; }
export interface MemoryPayload {
  action: MemoryAction; walletAddress: string; category?: SolvencyNamespaceCategory; text?: string; query?: string;
  subjectWallet?: string; upfrontAboveUsdc?: number; digest?: string; cursor?: SettlementCursor;
}
export interface MemoryEnvelope { payload: MemoryPayload; issuedAt: number; nonce: string; origin: string; signature: string; }
export interface RecalledMemory { blob_id: string; text: string; distance: number; namespace: string; category: SolvencyNamespaceCategory; created_at?: string; }
export function validatePayload(value: unknown): MemoryPayload {
  if (!value || typeof value !== 'object') throw new Error('A memory request is required.');
  const p = value as MemoryPayload;
  requireAddress(p.walletAddress);
  if (!['recall_all', 'remember', 'analyze', 'restore', 'save_preference', 'settlement', 'sync_settlements'].includes(p.action)) throw new Error('Unsupported memory action.');
  if (p.category !== undefined && !CATEGORIES.includes(p.category)) throw new Error('Invalid category.');
  for (const field of [p.text, p.query]) if (field !== undefined && (typeof field !== 'string' || !field.trim() || field.length > 8000)) throw new Error('Memory text/query must contain 1–8000 characters.');
  if (['remember', 'analyze'].includes(p.action) && !p.text?.trim()) throw new Error('Memory text is required.');
  if (p.action === 'save_preference') {
    requireAddress(p.subjectWallet, 'Contact wallet');
    if (p.subjectWallet === p.walletAddress || typeof p.upfrontAboveUsdc !== 'number') throw new Error('Choose a contact and an upfront funding threshold.');
    usdcToUnits(p.upfrontAboveUsdc);
  }
  if (p.action === 'settlement' && (typeof p.digest !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(p.digest))) throw new Error('A valid transaction digest is required.');
  if (p.cursor !== undefined && (p.action !== 'sync_settlements' || !p.cursor || typeof p.cursor.txDigest !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(p.cursor.txDigest) || typeof p.cursor.eventSeq !== 'string' || !/^\d{1,20}$/.test(p.cursor.eventSeq))) throw new Error('Invalid settlement history cursor.');
  if (p.cursor?.cursor !== undefined && (typeof p.cursor.cursor !== 'string' || !p.cursor.cursor.length || p.cursor.cursor.length > 4096)) throw new Error('Invalid event page cursor.');
  return p;
}
export function memorySigningMessage(e: Omit<MemoryEnvelope, 'signature'>) {
  return 'SolvencyLoop memory request v1\nNetwork: sui:mainnet\nOrigin: ' + e.origin + '\nIssued: ' + e.issuedAt + '\nNonce: ' + e.nonce + '\nPayload: ' + JSON.stringify(e.payload);
}
