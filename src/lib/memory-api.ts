import {validatePayload, type MemoryPayload, type RecalledMemory, type SettlementCursor } from './memory-protocol';
import {autopilotRequestId} from './autopilot-request';
import {authorizeMemoryRequest} from './memory-session';
import type { VerifiedSettlement } from './financial-insights';
import type {BillDraft} from './bill-draft';
import type {AgentExecution,PublicSocialPreference} from './autopilot-types';
import {AgentReplyError,isAgentAction,GEMINI_MODEL,type AgentTurn} from './agent-types';
import {isSplitContinuation} from './split-continuation';
import {isPendingSplitsQuestion} from './agent-questions';
import {notifyAgentProgress,type AgentProgressObserver} from './agent-progress';
import {readAgentProgressResponse} from './agent-progress-stream';
export interface MemoryResponse { execution?:AgentExecution;agentMemorySaved?:boolean;publicPreferences?:PublicSocialPreference[]; status?: string; count?: number; scanned?:number; draft?:BillDraft; agent?:AgentTurn; memories?: RecalledMemory[]; learnedMemories?:RecalledMemory[]; createdMemories?:RecalledMemory[]; verifiedSettlements?:VerifiedSettlement[]; rejectedEvidenceCount?:number; evidenceLimitReached?:boolean; purchaseId?:string; tatumAnchor?: { checkpoint: string; usdcBalance?:number }; result?: { truncated?: boolean }; nextCursor?: SettlementCursor | null; }
export class AutopilotUncertainError extends Error {constructor(public requestId:string){super('The agent response was interrupted. Check its on-chain receipt before another financial action.');}}
export async function requestMemory(payload: MemoryPayload, sign: (input: { message: Uint8Array }) => Promise<{ signature: string }>,onProgress?:AgentProgressObserver): Promise<MemoryResponse> {
  if(payload.action==='agent_chat')validatePayload(payload);
  const progress=payload.action==='agent_chat'?onProgress:undefined;
  notifyAgentProgress(progress,'authorization','active');
  const authorization=await authorizeMemoryRequest(payload,sign);
  notifyAgentProgress(progress,'authorization','complete');
  let safelyRejected=false;
  try{
  notifyAgentProgress(progress,'request','active');
  const response = await fetch(payload.action==='agent_chat'?'/api/agent':payload.action==='smart_split'?'/api/smart-split':'/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json',...(progress?{Accept:'application/x-ndjson'}:{}) }, body: JSON.stringify(authorization) });
  notifyAgentProgress(progress,'request','complete');
  const streamed=response.headers.get('content-type')?.includes('application/x-ndjson');
  const parsed=streamed?await readAgentProgressResponse(response,progress):{ok:response.ok,data:await response.json()};
  const data=parsed.data;
  if (!response.ok||!parsed.ok){
    safelyRejected=data.noFinancialExecution===true;
    const message=data.error||'Memory request failed.';
    if(payload.action==='agent_chat'&&safelyRejected&&data.code==='agent_reply')throw new AgentReplyError(message);
    throw new Error(message);
  }
  notifyAgentProgress(progress,'response','active');
  if(payload.action==='recall_learning'&&!Array.isArray(data.learnedMemories))throw new Error('The learned preference response is incomplete.');
  const chainRead=payload.action==='agent_chat'&&isPendingSplitsQuestion(payload.text!);
  if(['recall_all','refresh_learning','smart_split','agent_chat'].includes(payload.action)&&(!/^\d+$/.test(String(data.tatumAnchor?.checkpoint||''))||(!chainRead&&(!Array.isArray(data.memories)||!Array.isArray(data.verifiedSettlements)||!Number.isInteger(data.rejectedEvidenceCount)||data.rejectedEvidenceCount<0))))throw new Error('The learning response is incomplete. Retry your personal learning; no empty fallback was used.');
  if(payload.action==='agent_chat'){
    const agent=data.agent,hasAudit=typeof agent?.blobId==='string'&&!!agent.blobId&&data.status==='COMMITTED'&&Array.isArray(data.createdMemories)&&data.createdMemories.some((m:RecalledMemory)=>m.blob_id===agent.blobId);
    const tabReply=agent?.blobId===''&&(data.status==='READY'||data.status==='COMMITTED'&&data.agentMemorySaved===true&&Array.isArray(data.createdMemories)&&data.createdMemories.length>0);
    if(chainRead&&(data.status!=='READY'||agent?.action?.kind!=='none'||agent.blobId!==''||data.execution||data.createdMemories?.length))throw new Error('The pending-split lookup returned an unexpected action.');
    if((!hasAudit&&!tabReply)||(['submitted','confirmed'].includes(data.execution?.state)&&!hasAudit)||agent?.id!==authorization.nonce||agent.owner!==payload.walletAddress||agent.threadId!==payload.threadId||agent.user!==payload.text||agent.model!==GEMINI_MODEL||!isAgentAction(agent.action)||(agent.pendingSplit!==undefined&&!isSplitContinuation(agent.pendingSplit)))throw new Error('The agent response could not be validated. No action is available.');
  }
  if(payload.action==='smart_split'&&!data.draft)throw new Error('Smart Fill did not return a validated bill draft.');
  if(payload.action==='settlement'&&(!Number.isInteger(data.count)||data.count<1||!Array.isArray(data.createdMemories)||!data.createdMemories.length))throw new Error('The settlement memory commit was not confirmed. Retry the memory update without paying again.');
  notifyAgentProgress(progress,'response','complete');
  return data;
  }catch(e){if(payload.action==='agent_chat'&&payload.autoExecute&&!safelyRejected)throw new AutopilotUncertainError(await autopilotRequestId(payload.walletAddress,authorization.nonce));throw e;}
}
