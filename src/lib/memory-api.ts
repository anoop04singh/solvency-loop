import { memorySigningMessage, type MemoryPayload, type RecalledMemory } from './memory-protocol';
export interface MemoryResponse { status?: string; count?: number; memories?: RecalledMemory[]; tatumAnchor?: { checkpoint: string }; result?: { truncated?: boolean }; }
export async function requestMemory(payload: MemoryPayload, sign: (input: { message: Uint8Array }) => Promise<{ signature: string }>): Promise<MemoryResponse> {
  const authorization = { payload, issuedAt: Date.now(), nonce: crypto.randomUUID(), origin: window.location.origin };
  const { signature } = await sign({ message: new TextEncoder().encode(memorySigningMessage(authorization)) });
  const response = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...authorization, signature }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Memory request failed.');
  return data;
}
