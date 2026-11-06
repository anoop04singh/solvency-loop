import { after, NextRequest, NextResponse } from 'next/server';
import { errorMessage } from '@/lib/config';
import { verifyMemoryEnvelope } from '@/lib/memory-auth';
import { executeMemoryRequest } from '@/lib/memory-service';
import { requestOrigin } from '@/lib/http-origin';
import type {MemoryAction} from './memory-protocol';
import {AgentReplyError} from './agent-types';
export async function handleMemoryRequest(req: NextRequest,requiredAction?:MemoryAction) {
  let envelope;
  try {
    const origin = requestOrigin(req);
    if (req.headers.get('origin') !== origin) return NextResponse.json({ error: 'Same-origin wallet authorization required.',noFinancialExecution:true }, { status: 403 });
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 32_000) return NextResponse.json({ error: 'Request too large.',noFinancialExecution:true }, { status: 413 });
    envelope = await verifyMemoryEnvelope(JSON.parse(raw), origin);
    if(requiredAction&&envelope.payload.action!==requiredAction)return NextResponse.json({error:'This endpoint requires '+requiredAction+'.',noFinancialExecution:true},{status:400});
  } catch (error) { return NextResponse.json({ error: errorMessage(error),noFinancialExecution:true }, { status: 401 }); }
  try {
    const grant = envelope.delegation?.grant;
    const result = await executeMemoryRequest(envelope.payload, envelope.nonce, undefined, {
      issuedAt:envelope.issuedAt,
      ...(grant&&envelope.payload.autoMemory?{background:{expiresAt:grant.expiresAt,schedule:after}}:{}),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    let message = errorMessage(error);
    for (const key of [process.env.TATUM_API_KEY, process.env.MEMWAL_DELEGATE_PRIVATE_KEY, process.env.OPENAI_API_KEY,process.env.GEMINI_API_KEY,process.env.SUI_AGENT_PRIVATE_KEY,process.env.AUTOPILOT_WEBHOOK_SECRET]) if (key) message = message.split(key).join('[redacted]');
    const code=envelope.payload.action==='agent_chat'&&error instanceof AgentReplyError?'agent_reply':undefined;
    return NextResponse.json({ error: message,code,noFinancialExecution:true }, { status: message.includes('not configured') ? 503 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
