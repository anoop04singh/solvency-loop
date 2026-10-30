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
    return new NextResponse(text, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'x-tatum-routed': 'sui-mainnet.gateway.tatum.io' } });
  } catch (error) {
    const message = errorMessage(error);
    return NextResponse.json({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }, { status: message.includes('not configured') ? 503 : 400 });
  }
}
