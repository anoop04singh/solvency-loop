import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { memorySigningMessage, validatePayload, type MemoryEnvelope } from './memory-protocol';
import { tatumSuiClient } from './tatum-rpc-client';
import {decodeBytes,sessionSigningMessage,validateSessionGrant} from './memory-session-protocol';
export async function verifyMemoryEnvelope(value: unknown, origin: string, now = Date.now()): Promise<MemoryEnvelope> {
  if (!value || typeof value !== 'object') throw new Error('Signed wallet request required.');
  const e = value as MemoryEnvelope;
  validatePayload(e.payload);
  if(e.payload.autoMemory&&!e.delegation)throw Error('Quiet Memory authorization is required for automatic learning.');
  if (!Number.isSafeInteger(e.issuedAt) || e.issuedAt > now + 10_000 || now - e.issuedAt > 120_000) throw new Error('Wallet authorization expired; sign a new request.');
  if (e.origin !== origin || !/^https?:\/\//.test(e.origin)) throw new Error('Wallet authorization is for another origin.');
  if (typeof e.nonce !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(e.nonce) || typeof e.signature !== 'string') throw new Error('Malformed wallet authorization.');
  if(e.delegation){
    const {grant,signature}=e.delegation;validateSessionGrant(grant,origin,now);
    if(grant.wallet!==e.payload.walletAddress||grant.accountId!==e.payload.sessionAccountId||e.issuedAt<grant.issuedAt||e.issuedAt>=grant.expiresAt)throw Error('Session is for another wallet, account or time.');
    await verifyPersonalMessageSignature(new TextEncoder().encode(sessionSigningMessage(grant)),signature,{address:grant.wallet,client:tatumSuiClient});
    const key=await crypto.subtle.importKey('spki',decodeBytes(grant.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decodeBytes(e.signature),new TextEncoder().encode(memorySigningMessage(e))))throw Error('Invalid delegated request signature.');
  }else await verifyPersonalMessageSignature(new TextEncoder().encode(memorySigningMessage(e)), e.signature, { address: e.payload.walletAddress, client: tatumSuiClient });
  return e;
}
