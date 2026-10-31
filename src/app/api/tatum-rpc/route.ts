import { NextRequest, NextResponse } from 'next/server';
import { errorMessage } from '@/lib/config';
import { proxyTatumRpc } from '@/lib/rpc-proxy';
import { requestOrigin } from '@/lib/http-origin';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('origin') && req.headers.get('origin') !== requestOrigin(req)) return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 });
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 512_000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const response = await proxyTatumRpc(JSON.parse(raw));
    let text = await response.text();
    if (process.env.TATUM_API_KEY) text = text.split(process.env.TATUM_API_KEY).join('[redacted]');
    if (response.status === 404) text = JSON.stringify({ errors: [{ message: 'Tatum GraphQL routing failed. Contact the application operator.' }] });
    if (response.status === 429) text = JSON.stringify({ errors: [{ message: 'The network provider is busy. Wait a moment, then refresh. No payment has been retried automatically.' }] });
    return new NextResponse(text, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'x-tatum-routed': 'sui-mainnet.gateway.tatum.io/graphql', ...(response.headers.get('retry-after') ? { 'Retry-After': response.headers.get('retry-after')! } : {}) } });
  } catch (error) {
    let message = errorMessage(error);
    if (process.env.TATUM_API_KEY) message = message.split(process.env.TATUM_API_KEY).join('[redacted]');
    return NextResponse.json({ errors: [{ message }] }, { status: message.includes('not configured') ? 503 : 400 });
  }
}
