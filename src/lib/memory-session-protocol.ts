import {requireAddress} from './config';
export const MEMORY_SESSION_MS=60*60*1000;
export interface MemorySessionGrant {wallet:string;accountId:string;origin:string;publicKey:string;nonce:string;issuedAt:number;expiresAt:number;}
export interface MemoryDelegation {grant:MemorySessionGrant;signature:string;}
export const encodeBytes=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
export function decodeBytes(value:string){const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(encodeBytes(bytes)!==value)throw Error('Noncanonical session encoding.');return bytes;}
export function sessionSigningMessage(g:MemorySessionGrant){return 'SolvencyLoop memory delegation v1\n'+JSON.stringify(g)+'\nScope: Read, recall, analyze and write only this linked owned MemWal account for one hour. Requests must be signed by this temporary browser key and bound to payload, origin, timestamp and nonce. Financial execution requires a separately funded on-chain agent allowance. No wallet or account ownership transfer.';}
export function validateSessionGrant(g:MemorySessionGrant,origin:string,now=Date.now()){
 if(!g||requireAddress(g.wallet)!==g.wallet||requireAddress(g.accountId)!==g.accountId||g.origin!==origin||typeof g.publicKey!=='string'||g.publicKey.length>200||typeof g.nonce!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(g.nonce)||!Number.isSafeInteger(g.issuedAt)||!Number.isSafeInteger(g.expiresAt)||g.issuedAt>now+10000||g.expiresAt<=now||g.expiresAt<=g.issuedAt||g.expiresAt-g.issuedAt>MEMORY_SESSION_MS)throw Error('Memory session expired or is invalid. Authorize a new session.');
}
