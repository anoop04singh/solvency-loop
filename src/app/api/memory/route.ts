import { NextRequest, NextResponse } from 'next/server';
import { errorMessage } from '@/lib/config';
import { verifyMemoryEnvelope } from '@/lib/memory-auth';
import { executeMemoryRequest } from '@/lib/memory-service';
import { requestOrigin } from '@/lib/http-origin';
export const runtime = 'nodejs';
export const maxDuration = 600;
export async function POST(req: NextRequest) {
  let envelope;
  try {
    const origin = requestOrigin(req);
    if (req.headers.get('origin') !== origin) return NextResponse.json({ error: 'Same-origin wallet authorization required.' }, { status: 403 });
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 32_000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    envelope = await verifyMemoryEnvelope(JSON.parse(raw), origin);
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 401 }); }
  try {
    const result = await executeMemoryRequest(envelope.payload, envelope.nonce);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    let message = errorMessage(error);
    for (const key of [process.env.TATUM_API_KEY, process.env.MEMWAL_DELEGATE_PRIVATE_KEY, process.env.OPENAI_API_KEY]) if (key) message = message.split(key).join('[redacted]');
    return NextResponse.json({ error: message }, { status: message.includes('not configured') ? 503 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
