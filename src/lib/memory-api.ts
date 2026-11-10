import {validatePayload, type MemoryPayload, type MemoryReadPhase, type RecalledMemory, type SettlementCursor } from './memory-protocol';
import {autopilotRequestId} from './autopilot-request';
import {authorizeMemoryRequest} from './memory-session';
import type { VerifiedSettlement } from './financial-insights';
import type {BillDraft} from './bill-draft';
import type {AgentExecution,PublicSocialPreference,GroupConvention} from './autopilot-types';
import {requireAddress} from './config';
import {AgentReplyError,isAgentAction,GEMINI_MODEL,type AgentTurn} from './agent-types';
import {isSplitContinuation} from './split-continuation';
import {isPendingSplitsQuestion} from './agent-questions';
import {notifyAgentProgress,type AgentProgressObserver} from './agent-progress';
import {readAgentProgressResponse} from './agent-progress-stream';
import type {AgentStreamError} from './agent-progress-stream';
export interface MemoryResponse { readPhase?:MemoryReadPhase;memoryAccountId?:string;nextEvidenceOffset?:number|null;evidenceSnapshot?:string;groups?:GroupConvention[];execution?:AgentExecution;agentMemorySaved?:boolean;publicPreferences?:PublicSocialPreference[]; status?: string; count?: number; scanned?:number; draft?:BillDraft; agent?:AgentTurn; memories?: RecalledMemory[]; learnedMemories?:RecalledMemory[]; createdMemories?:RecalledMemory[]; verifiedSettlements?:VerifiedSettlement[]; rejectedEvidenceCount?:number; evidenceLimitReached?:boolean; purchaseId?:string; tatumAnchor?: { checkpoint: string; usdcBalance?:number }; result?: { truncated?: boolean }; nextCursor?: SettlementCursor | null; }
export class AutopilotUncertainError extends Error {constructor(public requestId:string){super('The agent response was interrupted. Check its on-chain receipt before another financial action.');}}
async function recallPersonalLearning(payload:MemoryPayload,sign:(input:{message:Uint8Array})=>Promise<{signature:string}>,progress?:AgentProgressObserver):Promise<MemoryResponse>{
  const phaseProgress=(phase:MemoryReadPhase):AgentProgressObserver=>event=>{
    if(event.stage==='response')return;
    if(event.stage==='memory'){
      if(phase!=='evidence')notifyAgentProgress(progress,phase==='personal'?'personal_memory':'social_context',event.state,{count:event.count});
    }else if(event.stage!=='evidence'){
      try{progress?.(event);}catch{/* Presentation must not interrupt sign-in. */}
    }
  };
  const personal=await requestMemory({...payload,readPhase:'personal'},sign,phaseProgress('personal'));
  notifyAgentProgress(progress,'personal_memory','complete',{count:personal.memories!.length});
  const accountId=personal.memoryAccountId;
  const sameAccount=(part:MemoryResponse)=>{if(part.memoryAccountId!==accountId)throw Error('Your memory account changed while loading. Authorize sign-in again.');};
  notifyAgentProgress(progress,'social_context','active');
  const social=await requestMemory({...payload,readPhase:'social'},sign,phaseProgress('social'));sameAccount(social);
  notifyAgentProgress(progress,'social_context','complete',{count:social.verifiedSettlements!.length});
  const verifiedSettlements:VerifiedSettlement[]=[];
  let rejectedEvidenceCount=0,evidenceLimitReached=false,offset=0,snapshot:string|undefined,anchor=personal.tatumAnchor;
  for(let page=0;page<4;page++){
    notifyAgentProgress(progress,'evidence','active',{count:verifiedSettlements.length});
    const evidence=await requestMemory({...payload,readPhase:'evidence',evidenceOffset:offset,...(snapshot?{evidenceSnapshot:snapshot}:{})},sign,phaseProgress('evidence'));
    sameAccount(evidence);verifiedSettlements.push(...evidence.verifiedSettlements!);
    rejectedEvidenceCount+=evidence.rejectedEvidenceCount!;evidenceLimitReached ||= evidence.evidenceLimitReached===true;anchor=evidence.tatumAnchor;
    if(evidence.nextEvidenceOffset===null){
      notifyAgentProgress(progress,'evidence','complete',{count:verifiedSettlements.length});
      notifyAgentProgress(progress,'response','active');
      const result={memories:[...new Map([...personal.memories!,...social.memories!].map(m=>[m.namespace+':'+m.blob_id,m])).values()],verifiedSettlements:[...verifiedSettlements,...social.verifiedSettlements!],rejectedEvidenceCount,evidenceLimitReached,publicPreferences:social.publicPreferences,groups:social.groups,tatumAnchor:anchor};
      notifyAgentProgress(progress,'response','complete');
      return result;
    }
    if(evidence.nextEvidenceOffset!==offset+5||evidence.nextEvidenceOffset>15)throw Error('Evidence pagination did not advance. Personal insights were not marked ready.');
    offset=evidence.nextEvidenceOffset;snapshot=evidence.evidenceSnapshot;
  }
  throw Error('Evidence verification did not finish. Retry sign-in; no partial learning result was accepted.');
}
async function readMemoryJsonResponse(response:Response,action:MemoryPayload['action']):Promise<{ok:boolean;data:MemoryResponse&Partial<AgentStreamError>}>{
  const text=await response.text();
  let value:unknown;try{value=JSON.parse(text);}catch{/* Hosts may return an HTML gateway error. */}
  const data=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
  if(response.ok){
    if(!data)throw Error('The memory service returned an unreadable response. Retry your personal learning; no empty fallback was used.');
    return {ok:true,data:data as MemoryResponse&Partial<AgentStreamError>};
  }
  if(typeof data?.error==='string'&&data.error.trim())return {ok:false,data:data as MemoryResponse&Partial<AgentStreamError>};
  const reference=response.headers.get('x-nf-request-id')||response.headers.get('x-vercel-id');
  const suffix=reference&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(reference)?' Hosting request: '+reference+'.':'';
  const description=[data?.errorType,data?.errorMessage,data?.message,text.slice(0,1000)].filter(v=>typeof v==='string').join(' ');
  const timedOut=[408,504].includes(response.status)||/timed?\s*out|timeout/i.test(description);
  // Do not expose platform HTML, stacks, or internal messages, and never invent
  // noFinancialExecution for an interrupted autonomous command.
  const retry=['recall_all','recall_learning'].includes(action)?'Retry sign-in.':'Check the request status before retrying.';
  const error=timedOut
    ?'The memory service timed out (HTTP '+response.status+'). '+retry+suffix
    :'The memory service could not complete the request (HTTP '+response.status+'). Check the hosting function logs. '+retry+suffix;
  return {ok:false,data:{...data,error} as MemoryResponse&Partial<AgentStreamError>};
}
export async function requestMemory(payload: MemoryPayload, sign: (input: { message: Uint8Array }) => Promise<{ signature: string }>,onProgress?:AgentProgressObserver): Promise<MemoryResponse> {
  if(payload.action==='agent_chat'||payload.action==='recall_all')validatePayload(payload);
  if(payload.action==='recall_all'&&!payload.readPhase)return recallPersonalLearning(payload,sign,onProgress);
  const progress=onProgress;
  const stream=!!progress||['recall_all','recall_learning'].includes(payload.action);
  notifyAgentProgress(progress,'authorization','active');
  const authorization=await authorizeMemoryRequest(payload,sign);
  notifyAgentProgress(progress,'authorization','complete');
  let safelyRejected=false;
  try{
  notifyAgentProgress(progress,'request','active');
  const response = await fetch(payload.action==='agent_chat'?'/api/agent':payload.action==='smart_split'?'/api/smart-split':'/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json',...(stream?{Accept:'application/x-ndjson'}:{}) }, body: JSON.stringify(authorization) });
  notifyAgentProgress(progress,'request','complete');
  const streamed=response.headers.get('content-type')?.includes('application/x-ndjson');
  const parsed=streamed?await readAgentProgressResponse(response,progress):await readMemoryJsonResponse(response,payload.action);
  const data=parsed.data;
  if (!response.ok||!parsed.ok){
    safelyRejected=data.noFinancialExecution===true;
    const message=data.error||'Memory request failed.';
    if(payload.action==='agent_chat'&&safelyRejected&&data.code==='agent_reply')throw new AgentReplyError(message);
    throw new Error(message);
  }
  notifyAgentProgress(progress,'response','active');
  if(payload.action==='recall_all'&&payload.readPhase){
    if(data.readPhase!==payload.readPhase||!data.memoryAccountId||requireAddress(data.memoryAccountId)!==data.memoryAccountId||authorization.payload.sessionAccountId&&authorization.payload.sessionAccountId!==data.memoryAccountId||!/^\d+$/.test(String(data.tatumAnchor?.checkpoint||''))||data.execution||data.createdMemories?.length)throw Error('The personal learning phase could not be validated. No partial insights were accepted.');
    if(payload.readPhase==='personal'&&!Array.isArray(data.memories))throw Error('Personal memory is incomplete.');
    if(payload.readPhase==='social'&&(!Array.isArray(data.memories)||!Array.isArray(data.verifiedSettlements)||!Array.isArray(data.publicPreferences)||!Array.isArray(data.groups)))throw Error('Shared context is incomplete.');
    if(payload.readPhase==='evidence'&&(!Array.isArray(data.verifiedSettlements)||typeof data.rejectedEvidenceCount!=='number'||!Number.isInteger(data.rejectedEvidenceCount)||data.rejectedEvidenceCount<0||typeof data.evidenceSnapshot!=='string'||!/^[a-f0-9]{64}$/.test(data.evidenceSnapshot)||data.nextEvidenceOffset!==null&&(!Number.isInteger(data.nextEvidenceOffset)||typeof data.nextEvidenceOffset!=='number')))throw Error('Payment evidence is incomplete.');
    notifyAgentProgress(progress,'response','complete');
    return data;
  }
  if(payload.action==='recall_learning'&&!Array.isArray(data.learnedMemories))throw new Error('The learned preference response is incomplete.');
  const chainRead=payload.action==='agent_chat'&&isPendingSplitsQuestion(payload.text!);
  if(['recall_all','refresh_learning','smart_split','agent_chat'].includes(payload.action)&&(!/^\d+$/.test(String(data.tatumAnchor?.checkpoint||''))||(!chainRead&&(!Array.isArray(data.memories)||!Array.isArray(data.verifiedSettlements)||typeof data.rejectedEvidenceCount!=='number'||!Number.isInteger(data.rejectedEvidenceCount)||data.rejectedEvidenceCount<0))))throw new Error('The learning response is incomplete. Retry your personal learning; no empty fallback was used.');
  if(payload.action==='agent_chat'){
    const agent=data.agent,hasAudit=typeof agent?.blobId==='string'&&!!agent.blobId&&data.status==='COMMITTED'&&Array.isArray(data.createdMemories)&&data.createdMemories.some((m:RecalledMemory)=>m.blob_id===agent.blobId);
    const tabReply=agent?.blobId===''&&(data.status==='READY'||data.status==='COMMITTED'&&data.agentMemorySaved===true&&Array.isArray(data.createdMemories)&&data.createdMemories.length>0);
    if(chainRead&&(data.status!=='READY'||agent?.action?.kind!=='none'||agent.blobId!==''||data.execution||data.createdMemories?.length))throw new Error('The pending-split lookup returned an unexpected action.');
    if((!hasAudit&&!tabReply)||(['submitted','confirmed'].includes(data.execution?.state||'')&&!hasAudit)||agent?.id!==authorization.nonce||agent.owner!==payload.walletAddress||agent.threadId!==payload.threadId||agent.user!==payload.text||agent.model!==GEMINI_MODEL||!isAgentAction(agent.action)||(agent.pendingSplit!==undefined&&!isSplitContinuation(agent.pendingSplit)))throw new Error('The agent response could not be validated. No action is available.');
  }
  if(payload.action==='smart_split'&&!data.draft)throw new Error('Smart Fill did not return a validated bill draft.');
  if(payload.action==='settlement'&&(typeof data.count!=='number'||!Number.isInteger(data.count)||data.count<1||!Array.isArray(data.createdMemories)||!data.createdMemories.length))throw new Error('The settlement memory commit was not confirmed. Retry the memory update without paying again.');
  notifyAgentProgress(progress,'response','complete');
  return data;
  }catch(e){if(payload.action==='agent_chat'&&payload.autoExecute&&!safelyRejected)throw new AutopilotUncertainError(await autopilotRequestId(payload.walletAddress,authorization.nonce));throw e;}
}
