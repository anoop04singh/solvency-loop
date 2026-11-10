import { after, NextRequest, NextResponse } from 'next/server';
import { errorMessage } from '@/lib/config';
import { verifyMemoryEnvelope } from '@/lib/memory-auth';
import { executeMemoryRequest } from '@/lib/memory-service';
import { requestOrigin } from '@/lib/http-origin';
import type {MemoryAction} from './memory-protocol';
import {AgentReplyError} from './agent-types';
import {agentProgressResponse,type AgentStreamError} from './agent-progress-stream';
import type {AgentProgressObserver} from './agent-progress';
interface RouteDependencies {verify:typeof verifyMemoryEnvelope;execute:typeof executeMemoryRequest;after:(task:()=>Promise<void>)=>void;}
const defaults:RouteDependencies={verify:verifyMemoryEnvelope,execute:executeMemoryRequest,after};
export async function handleMemoryRequest(req: NextRequest,requiredAction?:MemoryAction,deps:RouteDependencies=defaults) {
  let envelope;
  try {
    const origin = requestOrigin(req);
    if (req.headers.get('origin') !== origin) return NextResponse.json({ error: 'Same-origin wallet authorization required.',noFinancialExecution:true }, { status: 403 });
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 32_000) return NextResponse.json({ error: 'Request too large.',noFinancialExecution:true }, { status: 413 });
    envelope = await deps.verify(JSON.parse(raw), origin);
    if(requiredAction&&envelope.payload.action!==requiredAction)return NextResponse.json({error:'This endpoint requires '+requiredAction+'.',noFinancialExecution:true},{status:400});
  } catch (error) { return NextResponse.json({ error: errorMessage(error),noFinancialExecution:true }, { status: 401 }); }
  let executionMayHaveStarted=false;
  const failure=(error:unknown):AgentStreamError=>{
    let message = errorMessage(error);
    for (const key of [process.env.TATUM_API_KEY, process.env.MEMWAL_DELEGATE_PRIVATE_KEY, process.env.OPENAI_API_KEY,process.env.GEMINI_API_KEY,process.env.SUI_AGENT_PRIVATE_KEY,process.env.AUTOPILOT_WEBHOOK_SECRET]) if (key) message = message.split(key).join('[redacted]');
    const code=envelope.payload.action==='agent_chat'&&error instanceof AgentReplyError?'agent_reply':undefined;
    return {error:message,code,noFinancialExecution:!executionMayHaveStarted};
  };
  try {
    const grant=envelope.delegation?.grant,tasks:(()=>Promise<void>)[]=[];
    if(grant&&envelope.payload.autoMemory)deps.after(async()=>{for(const task of tasks)await task();});
    const run=(observer?:AgentProgressObserver)=>deps.execute(envelope.payload,envelope.nonce,undefined,{
      issuedAt:envelope.issuedAt,
      progress:event=>{if(event.stage==='execution'&&event.state==='active')executionMayHaveStarted=true;observer?.(event);},
      deliverConfirmed:digest=>deps.after(async()=>{
        try{const {dispatchConfirmedBill}=await import('./autopilot-dispatch');await dispatchConfirmedBill(digest);}
        catch{console.warn('Confirmed transaction retained; incoming automatic payments need event-delivery retry.');}
      }),
      ...(grant&&envelope.payload.autoMemory?{background:{expiresAt:grant.expiresAt,schedule:(task:()=>Promise<void>)=>{tasks.push(task);}}}:{}),
    });
    const streamable=['agent_chat','recall_all','recall_learning'].includes(envelope.payload.action);
    if(streamable&&req.headers.get('accept')?.includes('application/x-ndjson'))return agentProgressResponse(run,failure);
    return NextResponse.json(await run(),{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const data=failure(error);
    return NextResponse.json(data,{status:data.error.includes('not configured')?503:502,headers:{'Cache-Control':'no-store'}});
  }
}
