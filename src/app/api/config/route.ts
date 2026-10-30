import { NextResponse } from 'next/server';
import { publicConfig, requireAddress } from '@/lib/config';
export const dynamic = 'force-dynamic';
export function GET() {
  const missing: string[] = [];
  for (const [key, value] of Object.entries({ TATUM_API_KEY: process.env.TATUM_API_KEY, MEMWAL_DELEGATE_PRIVATE_KEY: process.env.MEMWAL_DELEGATE_PRIVATE_KEY })) if (!value) missing.push(key);
  const c = publicConfig();
  for (const [label, value] of Object.entries(c)) { try { requireAddress(value); } catch { missing.push(label); } }
  return NextResponse.json({ configured: !missing.length, missing }, { headers: { 'Cache-Control': 'no-store' } });
}
