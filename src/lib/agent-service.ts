import {recentBillCategories} from './bill-category';
import {checkInPurchases} from './bill-purchases';
import {generateAgentIntent} from './gemini';
import {GEMINI_MODEL,type AgentAction,type AgentTurn} from './agent-types';
import {prepareAgentAction,type AgentContext} from './agent-action';
import {learnedNamespace,latestLearnedPreferences,selectLearningChoices,type AgentExchange} from './agent-learning';
import {equalSplitContinuation,literalEqualSplit,prepareContinuedSplit,splitFollowUp,type SplitContinuation} from './split-continuation';
import {notifyAgentProgress,type AgentProgressObserver} from './agent-progress';
export {prepareAgentAction,type AgentContext} from './agent-action';
export async function createAgentTurn(p:{text:string;threadId:string;nonce:string;source?:'user'|'autopilot';conversation?:AgentExchange[];pendingSplit?:SplitContinuation;context:AgentContext;generate?:(context:unknown)=>Promise<unknown>;progress?:AgentProgressObserver}){
 const c=p.context,conversation=c.autonomyRequested?[]:p.conversation||[];
 const memories=c.memories.filter(m=>m.namespace!==learnedNamespace(c.profile.wallet)&&!m.text.includes('SOLVENCY_AGENT_V1 ')&&!m.text.includes('SOLVENCY_AGENT_AUDIT_V1 ')).slice(0,60);
 const learned=c.autonomyRequested?[]:latestLearnedPreferences(c.memories,c.profile.wallet).filter(m=>m.value!==null).map(({kind,topic,value})=>({kind,topic,value}));
 const suggestedCategories=c.autonomyRequested?[]:recentBillCategories(c.splits.filter(split=>split.creator===c.profile.wallet));
 let pendingSplit=c.autonomyRequested?undefined:p.pendingSplit;
 let followUp:ReturnType<typeof splitFollowUp>,followUpError:string|undefined;
 try{if(pendingSplit)followUp=splitFollowUp(pendingSplit,p.text,c);}
 catch(error){followUpError=(error as Error).message;}
 const context={autonomyRequested:c.autonomyRequested,memoryAutomationRequested:c.memoryAutomationRequested,allowance:c.allowance,publicPreferences:c.publicPreferences,approvedGroups:c.groups?.slice(0,10),request:p.text,now:c.now,timeZone:c.timeZone,profile:c.profile,loadedSplits:c.splits,ownedVaults:c.vaults,verifiedSettlements:c.verifiedSettlements,purchases:checkInPurchases(c.memories,c.profile.wallet,c.splits),memory:memories.map(m=>({text:m.text.slice(0,3000),blobId:m.blob_id,category:m.category})),conversation,learned,suggestedCategories,pendingSplit};
 if(!followUp&&!followUpError)notifyAgentProgress(p.progress,'reasoning','active');
 const raw=followUp||followUpError?null:await (p.generate||generateAgentIntent)(context);
 if(!followUp&&!followUpError)notifyAgentProgress(p.progress,'reasoning','complete');
 notifyAgentProgress(p.progress,'validation','active');
 const intent=raw as Record<string,unknown>|null;
 const fallback=intent?.action==='clarify'?literalEqualSplit(p.text):undefined;
 const split=equalSplitContinuation(raw)||fallback;
 let prepared:{action:AgentAction;reply:string};
 if(followUp)pendingSplit=followUp.pending;
 else if(split||intent?.action==='split')pendingSplit=split;
 try{
  if(followUpError)throw Error(followUpError);
  prepared=followUp?.prepared||(split?prepareContinuedSplit(split,c):prepareAgentAction(raw,c));
  const action=prepared.action;
  if(action.kind==='contact'&&![p.text,...conversation.map(t=>t.user)].some(s=>s.toLowerCase().includes(action.walletAddress)))throw new Error('Paste the contact’s full canonical Sui wallet address. I cannot infer or invent it.');
  if(!['split','contact','none'].includes(action.kind))pendingSplit=undefined;
 }
 catch(e){prepared={action:{kind:'none'},reply:(e as Error).message};}
 const choices=c.memoryAutomationRequested&&!followUp?selectLearningChoices(intent?.memoryCandidates,p.text):[];
 const reply=choices.length&&prepared.action.kind==='none'?'I understand this is a standing preference. You can review learned preferences in Audit.':prepared.reply;
 const turn:AgentTurn={executionEligible:!fallback&&intent?.executionMode==='execute',source:p.source||'user',id:p.nonce,threadId:p.threadId,owner:c.profile.wallet,user:p.text,reply,action:prepared.action,createdAtMs:c.now,checkpoint:c.profile.latestCheckpoint,model:GEMINI_MODEL,contextBlobIds:memories.map(m=>m.blob_id),blobId:'',...(pendingSplit?{pendingSplit}:{})};
 notifyAgentProgress(p.progress,'validation','complete');
 return {turn,choices};
}
