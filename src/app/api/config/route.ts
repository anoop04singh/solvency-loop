import { NextResponse } from 'next/server';
import { publicConfig, requireAddress } from '@/lib/config';
import { delegateKeypair } from '@/lib/walrus-tatum-memory';
export const dynamic = 'force-dynamic';
export function GET() {
  const missing: string[] = [];
  for (const [key, value] of Object.entries({ TATUM_API_KEY: process.env.TATUM_API_KEY, MEMWAL_DELEGATE_PRIVATE_KEY: process.env.MEMWAL_DELEGATE_PRIVATE_KEY })) if (!value) missing.push(key);
  const c = publicConfig();
  for (const [label, value] of Object.entries(c)) { try { requireAddress(value); } catch { missing.push(label); } }
  if (process.env.MEMWAL_DELEGATE_PRIVATE_KEY) {
    try { if ('0x' + Buffer.from(delegateKeypair().getPublicKey().toRawBytes()).toString('hex') !== c.memwalDelegatePublicKey.toLowerCase()) missing.push('memwalDelegateKeyMatch'); }
    catch { missing.push('MEMWAL_DELEGATE_PRIVATE_KEY (invalid)'); }
  }
  return NextResponse.json({ configured: !missing.length, missing }, { headers: { 'Cache-Control': 'no-store' } });
}
