import { NextResponse } from 'next/server';
import { publicConfig, requireAddress } from '@/lib/config';
import { delegateKeypair } from '@/lib/walrus-tatum-memory';
import {GEMINI_MODEL} from '@/lib/agent-types';
export const dynamic = 'force-dynamic';
export function GET() {
  const missing: string[] = [];
  for (const [key, value] of Object.entries({ TATUM_API_KEY: process.env.TATUM_API_KEY, MEMWAL_DELEGATE_PRIVATE_KEY: process.env.MEMWAL_DELEGATE_PRIVATE_KEY,GEMINI_API_KEY:process.env.GEMINI_API_KEY })) if (!value?.trim()) missing.push(key);
  const c = publicConfig();
  for (const [label, value] of Object.entries(c)) { try { requireAddress(value); } catch { missing.push(label); } }
  if (process.env.MEMWAL_DELEGATE_PRIVATE_KEY) {
    try { if ('0x' + Buffer.from(delegateKeypair().getPublicKey().toRawBytes()).toString('hex') !== c.memwalDelegatePublicKey.toLowerCase()) missing.push('memwalDelegateKeyMatch'); }
    catch { missing.push('MEMWAL_DELEGATE_PRIVATE_KEY (invalid)'); }
  }
  return NextResponse.json({ configured: !missing.length, missing,agent:{model:GEMINI_MODEL,configured:!!process.env.GEMINI_API_KEY?.trim()} }, { headers: { 'Cache-Control': 'no-store' } });
}
