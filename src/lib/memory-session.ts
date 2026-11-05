import {MEMORY_SESSION_MS,encodeBytes,sessionSigningMessage,type MemoryDelegation} from './memory-session-protocol';
import {memorySigningMessage,type MemoryPayload,type MemoryEnvelope} from './memory-protocol';
type Sign=(p:{message:Uint8Array})=>Promise<{signature:string}>;
let current:{delegation:MemoryDelegation;key:CryptoKey;renewal?:Promise<unknown>}|null=null,version=0;
const listeners=new Set<()=>void>();
const changed=()=>{version++;listeners.forEach(l=>l());};
export const subscribeMemorySession=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const memorySessionVersion=()=>version;
export function memorySessionStatus(wallet:string){const g=current?.delegation.grant;return g?.wallet===wallet?{expiresAt:g.expiresAt,accountId:g.accountId}:null;}
export function endMemorySession(){current=null;changed();}
export async function startMemorySession(wallet:string,accountId:string,sign:Sign){
 const started=version;
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const issuedAt=Date.now();
 const grant={wallet,accountId,origin:window.location.origin,publicKey:encodeBytes(new Uint8Array(await crypto.subtle.exportKey('spki',keys.publicKey))),nonce:crypto.randomUUID(),issuedAt,expiresAt:issuedAt+MEMORY_SESSION_MS};
 if(started!==version)throw Error('Quiet memory was switched off or the wallet changed.');
 const signed=await sign({message:new TextEncoder().encode(sessionSigningMessage(grant))});
 if(started!==version)throw Error('Quiet memory was switched off or the wallet changed.');
 current={delegation:{grant,signature:signed.signature},key:keys.privateKey};changed();return grant;
}
/** The private request key exists only in memory. Reload/logout/wallet change discards it. */
export async function authorizeMemoryRequest(payload:MemoryPayload,sign:Sign):Promise<MemoryEnvelope>{
 if(current&&current.delegation.grant.wallet!==payload.walletAddress)endMemorySession();
 const expired=current;
 if(expired&&expired.delegation.grant.expiresAt<=Date.now()){
  const {wallet,accountId}=expired.delegation.grant;
  expired.renewal??=startMemorySession(wallet,accountId,sign).finally(()=>{expired.renewal=undefined;});
  await expired.renewal;
 }
 const session=current;
 if(expired&&(!session||session.delegation.grant.wallet!==payload.walletAddress))throw Error('The quiet memory session changed. Try the request again.');
 const scoped=session?{...payload,sessionAccountId:session.delegation.grant.accountId}:payload;
 const e={payload:scoped,issuedAt:Date.now(),nonce:crypto.randomUUID(),origin:window.location.origin,...(session?{delegation:session.delegation}:{})};
 const bytes=new TextEncoder().encode(memorySigningMessage(e));
 if(session){const signature=encodeBytes(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},session.key,bytes)));if(current!==session)throw Error('The quiet memory session changed. Try the request again.');return {...e,signature};}
 return {...e,...await sign({message:bytes})};
}
