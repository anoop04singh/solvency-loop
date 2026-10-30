import { CATEGORIES, requireAddress, type SolvencyNamespaceCategory } from './config';
export type MemoryAction = 'recall_all' | 'remember' | 'analyze' | 'restore' | 'seed_12_mainnet' | 'settlement';
export interface MemoryPayload {
  action: MemoryAction; walletAddress: string; category?: SolvencyNamespaceCategory; text?: string; query?: string;
  friendWallets?: { alex: string; priya: string; sam: string }; digest?: string;
}
export interface MemoryEnvelope { payload: MemoryPayload; issuedAt: number; nonce: string; origin: string; signature: string; }
export interface RecalledMemory { blob_id: string; text: string; distance: number; namespace: string; category: SolvencyNamespaceCategory; created_at?: string; }
export function validatePayload(value: unknown): MemoryPayload {
  if (!value || typeof value !== 'object') throw new Error('A memory request is required.');
  const p = value as MemoryPayload;
  requireAddress(p.walletAddress);
  if (!['recall_all', 'remember', 'analyze', 'restore', 'seed_12_mainnet', 'settlement'].includes(p.action)) throw new Error('Unsupported memory action.');
  if (p.category !== undefined && !CATEGORIES.includes(p.category)) throw new Error('Invalid category.');
  for (const field of [p.text, p.query]) if (field !== undefined && (typeof field !== 'string' || !field.trim() || field.length > 8000)) throw new Error('Memory text/query must contain 1–8000 characters.');
  if (['remember', 'analyze'].includes(p.action) && !p.text?.trim()) throw new Error('Memory text is required.');
  if (p.action === 'seed_12_mainnet') {
    if (!p.friendWallets) throw new Error('Three real friend wallets are required.');
    const friends = Object.values(p.friendWallets).map(a => requireAddress(a));
    if (friends.length !== 3 || new Set([...friends, p.walletAddress.toLowerCase()]).size !== 4) throw new Error('All four wallets must be distinct.');
  }
  if (p.action === 'settlement' && (typeof p.digest !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(p.digest))) throw new Error('A valid transaction digest is required.');
  return p;
}
export function memorySigningMessage(e: Omit<MemoryEnvelope, 'signature'>) {
  return 'SolvencyLoop memory request v1\nNetwork: sui:mainnet\nOrigin: ' + e.origin + '\nIssued: ' + e.issuedAt + '\nNonce: ' + e.nonce + '\nPayload: ' + JSON.stringify(e.payload);
}
