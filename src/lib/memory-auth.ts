import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { memorySigningMessage, validatePayload, type MemoryEnvelope } from './memory-protocol';
import { tatumSuiClient } from './tatum-rpc-client';
export async function verifyMemoryEnvelope(value: unknown, origin: string, now = Date.now()): Promise<MemoryEnvelope> {
  if (!value || typeof value !== 'object') throw new Error('Signed wallet request required.');
  const e = value as MemoryEnvelope;
  validatePayload(e.payload);
  if (!Number.isSafeInteger(e.issuedAt) || e.issuedAt > now + 10_000 || now - e.issuedAt > 120_000) throw new Error('Wallet authorization expired; sign a new request.');
  if (e.origin !== origin || !/^https?:\/\//.test(e.origin)) throw new Error('Wallet authorization is for another origin.');
  if (typeof e.nonce !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(e.nonce) || typeof e.signature !== 'string') throw new Error('Malformed wallet authorization.');
  await verifyPersonalMessageSignature(new TextEncoder().encode(memorySigningMessage(e)), e.signature, { address: e.payload.walletAddress, client: tatumSuiClient });
  return e;
}
