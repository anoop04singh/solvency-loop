import { memorySigningMessage, type MemoryPayload, type RecalledMemory, type SettlementCursor } from './memory-protocol';
import type { VerifiedSettlement } from './financial-insights';
import type {BillDraft} from './bill-draft';
export interface MemoryResponse { status?: string; count?: number; scanned?:number; draft?:BillDraft; memories?: RecalledMemory[]; createdMemories?:RecalledMemory[]; verifiedSettlements?:VerifiedSettlement[]; rejectedEvidenceCount?:number; evidenceLimitReached?:boolean; purchaseId?:string; tatumAnchor?: { checkpoint: string; usdcBalance?:number }; result?: { truncated?: boolean }; nextCursor?: SettlementCursor | null; }
export async function requestMemory(payload: MemoryPayload, sign: (input: { message: Uint8Array }) => Promise<{ signature: string }>): Promise<MemoryResponse> {
  const authorization = { payload, issuedAt: Date.now(), nonce: crypto.randomUUID(), origin: window.location.origin };
  const { signature } = await sign({ message: new TextEncoder().encode(memorySigningMessage(authorization)) });
  const response = await fetch(payload.action==='smart_split'?'/api/smart-split':'/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...authorization, signature }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Memory request failed.');
  if(['recall_all','refresh_learning','smart_split'].includes(payload.action)&&(!Array.isArray(data.memories)||!Array.isArray(data.verifiedSettlements)||!Number.isInteger(data.rejectedEvidenceCount)||data.rejectedEvidenceCount<0||!/^\d+$/.test(String(data.tatumAnchor?.checkpoint||''))))throw new Error('The learning response is incomplete. Retry your personal learning; no empty fallback was used.');
  if(payload.action==='smart_split'&&!data.draft)throw new Error('Smart Fill did not return a validated bill draft.');
  if(payload.action==='settlement'&&(!Number.isInteger(data.count)||data.count<1||!Array.isArray(data.createdMemories)||!data.createdMemories.length))throw new Error('The settlement memory commit was not confirmed. Retry the memory update without paying again.');
  return data;
}
