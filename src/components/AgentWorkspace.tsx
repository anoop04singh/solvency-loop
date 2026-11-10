"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {motion} from 'framer-motion';
import {Infinity as Loop,Terminal,ArrowUpRight,ArrowRight,Utensils,Shield,Zap,Brain,Eye,Lock,CheckCircle2,MessageCircle,FileText,Wallet,Plus,RefreshCw,LoaderCircle} from 'lucide-react';
import {BILL_CATEGORIES,BILL_CATEGORY_LABELS,encodeBillTitle,isBillCategory,type BillCategory} from '@/lib/bill-category';
import type {AgentTurn,AgentAction,SplitReviewDetails} from '@/lib/agent-types';
import {isAgentReadQuestion} from '@/lib/agent-questions';
import type {OnChainUserProfile} from '@/lib/onchain-user-manager';
import {formatUsdc} from '@/lib/money';
import type {spendingRoom} from '@/lib/financial-insights';
import type {WorkspaceView} from './WorkspaceNavigation';
import {AgentShader} from './AgentShader';
import {StepDialog} from './StepDialog';
import {LoadingState} from './LoadingState';import {AgentActivityTimeline} from './AgentActivityTimeline';import type {AgentProgress} from '@/lib/agent-progress';
import {usePresentationMotion} from '@/lib/use-presentation-motion';
export interface AgentReceipt {digest:string;state:'submitted'|'confirmed';recovered?:boolean;}
interface Props {progress?:AgentProgress[];controls?:ReactNode;autopilotActive?:boolean;reviewingPendingSplit?:boolean;profile:OnChainUserProfile;room:ReturnType<typeof spendingRoom>;recalled:boolean;memoryCount:number;turns:AgentTurn[];actionable:string[];receipts:Record<string,AgentReceipt>;saved:string[];now:number;disabled:boolean;busy:boolean;error?:string;pendingShares:number;regretCount:number;onSend:(text:string,draftOnly?:boolean)=>Promise<boolean>;onConfirm:(turn:AgentTurn,details?:SplitReviewDetails)=>Promise<boolean>;onInspect:()=>void;onEdit:(turn:AgentTurn)=>void;onNew:()=>void;onNavigate:(v:WorkspaceView)=>void;}
const actionLabel=(a:AgentAction)=>a.kind==='split'?'Review split':a.kind==='protect'?'Review 24-hour protection':a.kind==='settle'?'Review my settlement':a.kind==='fund'?'Review upfront funding':a.kind==='unlock'?'Review withdrawal':a.kind==='memory'?'Review memory update':a.kind==='contact'?'Review contact':a.kind==='activate'?'Review activation':a.kind==='cancel'?'Review cancellation':'Review refund';
function ActionDetails({action:a,status}:{action:AgentAction;status?:AgentReceipt['state']}){
 if(a.kind==='split')return <div className="agent-allocations"><div className="agent-bill-total"><strong>{a.draft.title}{a.draft.category&&<small className="field-help"> · {BILL_CATEGORY_LABELS[a.draft.category]}</small>}</strong><span>{formatUsdc(a.allocation.total)} USDC total</span></div><div className="agent-allocation-heading"><span>Peer & allocation</span><span>Calculated amount · {status==='confirmed'?'confirmed on Sui':status==='submitted'?'submitted, awaiting confirmation':'review required'}</span></div><div className="agent-allocation-row"><div><span className="agent-peer-avatar">Y</span><div><strong>You</strong><small>Included creator share</small></div></div><strong>{formatUsdc(a.allocation.creatorShare)} USDC</strong></div>{a.allocation.shares.map(p=><div className="agent-allocation-row" key={p.walletAddress}><div><span className="agent-peer-avatar">{p.handle.slice(0,2).toUpperCase()}</span><div><strong>{p.handle}</strong><small>{p.walletAddress.slice(0,8)}…{p.walletAddress.slice(-4)}</small></div></div><div className="agent-share-value"><strong>{formatUsdc(p.amountUsdc)} USDC</strong><span className={'agent-rule '+(p.requiresUpfrontEscrow?'amber':p.excludedItems.length?'blue':'green')}>{p.requiresUpfrontEscrow&&<Lock size={11}/>} {p.excludedItems.length?'Excluded: '+p.excludedItems.join(', '):p.history.count>=3?p.history.count+' verified payments · '+(p.history.averageLagMs/86400000).toFixed(1)+'d average':p.ruleApplied}{p.requiresUpfrontEscrow?' · Upfront escrow':''}</span></div></div>)}</div>;
 if(a.kind==='memory')return <dl className="review-facts agent-action-facts"><div><dt>Memory update</dt><dd>{a.summary}</dd></div><div><dt>Approval</dt><dd>Signed write to your owned MemWal account.</dd></div></dl>;
 if(a.kind==='contact')return <dl className="review-facts agent-action-facts"><div><dt>Contact</dt><dd>{a.handle}</dd></div><div><dt>Wallet</dt><dd>{a.walletAddress}</dd></div><div><dt>Visibility</dt><dd>Public on Sui after wallet approval.</dd></div></dl>;
 if(a.kind==='none')return null;
 return <dl className="review-facts agent-action-facts">{'amount'in a&&<div><dt>{a.kind==='protect'?'Protect for 24 hours':'Amount'}</dt><dd>{a.amount} USDC</dd></div>}{'splitIds'in a&&<div><dt>Bills</dt><dd>{a.splitIds.map(id=><code key={id}>{id}</code>)}</dd></div>}{'splitId'in a&&<div><dt>Bill</dt><dd>{a.splitId}</dd></div>}{'vaultId'in a&&<div><dt>Vault</dt><dd>{a.vaultId}</dd></div>}<div><dt>{status?'Status':'Approval'}</dt><dd>{status==='confirmed'?'Confirmed on Sui · native Circle USDC':status==='submitted'?'Submitted on Sui · confirmation pending':'Native Circle USDC · SUI gas · your wallet must approve.'}</dd></div></dl>;
}
export function AgentWorkspace(p:Props){
 const [input,setInput]=useState(''),[chatError,setChatError]=useState(''),[localError,setLocalError]=useState(''),[review,setReview]=useState<AgentTurn|null>(null),[working,setWorking]=useState(false),[sending,setSending]=useState(false),[topic,setTopic]=useState(''),[draftOnly,setDraftOnly]=useState(false);
 const [chatStarted,setChatStarted]=useState(false);
 const [splitDetails,setSplitDetails]=useState<SplitReviewDetails>({title:'',category:'other'});
 const composer=useRef<HTMLTextAreaElement>(null),sendInFlight=useRef(false),moving=usePresentationMotion();
 const conversation=useRef<HTMLDivElement>(null),latestReply=useRef<HTMLDivElement>(null);
 const dock=useRef<HTMLDivElement>(null),revealDock=useRef(false);
 const expanded=chatStarted||p.turns.length>0;
 const bringReplyBoxIntoView=useCallback(()=>{
  if(!revealDock.current)return;
  revealDock.current=false;
  dock.current?.scrollIntoView({block:'nearest'});
 },[]);
 useEffect(()=>{
  if(expanded&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)bringReplyBoxIntoView();
 },[expanded,bringReplyBoxIntoView]);
 const submit=async()=>{
  const message=input.trim();
  if(!message||p.disabled||working||sendInFlight.current)return;
  sendInFlight.current=true;
  if(!expanded)revealDock.current=true;
  setChatStarted(true);
  setSending(true);
  setChatError('');
  try{if(await p.onSend(message,draftOnly)){setInput('');setTopic('');}}
  catch(error){setChatError((error as Error).message);}
  finally{sendInFlight.current=false;setSending(false);}
 };
 const latest=p.turns.at(-1)?.id,reviewAllowed=!!review&&p.actionable.includes(review.id)&&p.now-review.createdAtMs<300000&&!p.receipts[review.id]&&!p.saved.includes(review.id);
 const reviewingSplit=review?.action.kind==='split';
 let splitTitleError='';
 if(reviewingSplit){try{encodeBillTitle(splitDetails.title,splitDetails.category);}catch(error){splitTitleError=(error as Error).message;}}
 const openReview=(turn:AgentTurn)=>{
  if(turn.action.kind==='split')setSplitDetails({title:turn.action.draft.title,category:turn.action.draft.category??'other'});
  setLocalError('');
  setReview(turn);
 };
 useEffect(()=>{
  const log=conversation.current,reply=latestReply.current;
  if(!log||!reply||sending)return;
  const replyStart=reply.getBoundingClientRect().top-log.getBoundingClientRect().top+log.scrollTop-12;
  log.scrollTop=Math.max(0,Math.min(replyStart,log.scrollHeight-log.clientHeight));
 },[latest,sending]);
 const greeting=p.now?new Date(p.now).getHours()<12?'Good morning':new Date(p.now).getHours()<18?'Good afternoon':'Good evening':'Welcome';
 useEffect(()=>{if(sending&&conversation.current)conversation.current.scrollTop=conversation.current.scrollHeight;},[sending,p.progress]);
 const memoryLink=<button className="agent-text-button" onClick={()=>p.onNavigate('Memory')}><RefreshCw size={14}/>Memory & preferences</button>;
 return <section className="agent-workspace"><AgentShader/><div className="agent-content"><div className="agent-status-strip"><div><span><i/>{p.recalled?formatUsdc(p.room.quota)+' USDC suggested':'Personal insights loading'}</span><span><Shield size={13}/>{formatUsdc(p.profile.safeFloorUsdc)} USDC reserve</span><button onClick={p.onInspect}><Brain size={14}/>Walrus Memory {p.recalled?'Active ('+p.memoryCount+' blobs)':'not loaded'}</button></div><span className="agent-chain-status"><i/>Sui Mainnet · Checkpoint #{p.profile.latestCheckpoint}</span></div>
 <header className="agent-hero"><span className="agent-core-label"><Brain size={14}/>Gemini + Walrus solvency core</span><h1>{greeting}, {p.profile.handle}.</h1><p>What would you like SolvencyLoop to prepare on Sui Mainnet today?</p></header>
 <section className="agent-chat-panel" data-expanded={expanded} aria-labelledby={expanded?'agent-chat-title':undefined}>
  {expanded&&<div className="agent-chat-reveal" onAnimationEnd={event=>{if(event.target===event.currentTarget)bringReplyBoxIntoView();}}><div className="agent-chat-history">
  <header className="agent-chat-header"><h2 id="agent-chat-title">Conversation</h2><div className="agent-conversation-tools"><button className="agent-text-button" onClick={()=>{p.onNew();setChatStarted(false);setInput('');setTopic('');setChatError('');}} disabled={p.disabled||working||sending}><Plus size={14}/>New conversation</button>{memoryLink}</div></header>
 <div className="agent-conversation" ref={conversation} role="log" aria-label="Agent messages" tabIndex={0}>{!latest&&!sending&&<div className="agent-empty" aria-hidden={sending}><MessageCircle size={20} aria-hidden="true"/><p>{sending?'Waiting for the agent’s reply…':'Your message is ready below.'}</p></div>}{p.turns.map(turn=>{const receipt=p.receipts[turn.id],saved=p.saved.includes(turn.id),fresh=p.actionable.includes(turn.id)&&p.now-turn.createdAtMs<300000,hasAction=turn.action.kind!=='none';return <motion.article key={turn.id} initial={moving?{opacity:0}:false} animate={{opacity:1}} transition={{duration:.25}}>{turn.user&&<div className="agent-user-message"><span>{turn.user}</span><i>{p.profile.handle.slice(0,1).toUpperCase()}</i></div>}<div className="agent-response-card" ref={turn.id===latest?latestReply:undefined}><header><div className="agent-response-icon"><Loop size={24}/></div><div><h2>SolvencyLoop Agent <span className={'agent-rule '+(receipt?.state==='confirmed'||saved?'green':receipt||hasAction?'amber':'blue')}>{receipt?.recovered?'Earlier request confirmed':receipt?.state==='confirmed'?'Confirmed on Sui':receipt?'Submitted':saved?'Memory updated':hasAction?'Proposed · review required':turn.blobId?'Walrus record':'Reply'}</span></h2><p>{turn.contextBlobIds.length>0&&<>Read {turn.contextBlobIds.length} saved {turn.contextBlobIds.length===1?'memory':'memories'} · </>}Checkpoint #{turn.checkpoint}</p></div></header><p className="agent-reply">{receipt?.recovered?'Recovered the receipt for an earlier execution of this request.':receipt?.state==='confirmed'?'The transaction is confirmed on Sui. Its receipt is shown below.':receipt?'The transaction was submitted. Check its receipt before another financial action.':saved?'Your update is committed to your owned memory account.':turn.reply}</p>{(turn.id===latest||receipt)&&(fresh||receipt)&&!receipt?.recovered?<ActionDetails action={turn.action} status={receipt?.state}/>:hasAction&&!fresh&&!receipt&&<p className="agent-expired">Earlier proposal. Prepare it again to check current amounts, eligibility and memory evidence.</p>}{turn.blobId&&<details className="agent-memory-reference"><summary>Walrus record · {turn.model}</summary><p>{turn.blobId}</p><p>Chain events confirm completed payments.</p></details>}{receipt&&<p className="agent-receipt"><CheckCircle2 size={16}/>{receipt.state==='confirmed'?'Confirmed transaction: ':'Submitted transaction: '}<code>{receipt.digest}</code></p>}{(hasAction||turn.blobId)&&<footer><div>{turn.action.kind==='split'&&!receipt&&<button className="agent-text-button" onClick={()=>p.onEdit(turn)} disabled={p.disabled}>Edit items manually</button>}{turn.blobId&&<button className="agent-text-button" onClick={p.onInspect}><Eye size={15}/>Inspect Walrus proof</button>}</div>{hasAction&&!receipt&&!saved&&(fresh?<button className="agent-primary" disabled={p.disabled||working} onClick={()=>openReview(turn)}>{actionLabel(turn.action)}<ArrowRight size={16}/></button>:<span className="agent-expired">Ask again to prepare a fresh action.</span>)}</footer>}</div></motion.article>;})}{sending&&<AgentActivityTimeline events={p.progress||[]}/>}</div>
  </div></div>}
  <div className="agent-chat-dock" ref={dock}>
 <form className="agent-composer" aria-busy={sending} onSubmit={e=>{e.preventDefault();void submit();}}>
  <Terminal size={22} aria-hidden="true"/>
  <label className="sr-only" htmlFor="agent-prompt">Message SolvencyLoop</label>
  <textarea ref={composer} id="agent-prompt" rows={1} maxLength={4000} value={input} disabled={p.disabled||working||sending} aria-describedby={chatError?'agent-chat-error':undefined} placeholder={topic||(latest?'Reply to SolvencyLoop…':'Describe a split, a purchase, a payment or what you want to remember…')} onChange={e=>{setInput(e.target.value);setChatError('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void submit();}}}/>
  <button className="agent-send" type="submit" disabled={p.disabled||working||sending||!input.trim()}>
   <span className="agent-send-label" aria-hidden={sending}>{p.autopilotActive&&!p.reviewingPendingSplit&&!draftOnly&&!isAgentReadQuestion(input)?'Run within limits':latest?'Send reply':'Ask agent'}<ArrowRight size={16} aria-hidden="true"/></span>
   {sending&&<span className="agent-send-pending"><LoaderCircle className="agent-send-spinner" size={16} aria-hidden="true"/>Waiting…</span>}
  </button>
 </form>
 <span className="sr-only" role="status">{sending?'Waiting for the agent’s reply.':''}</span>
 {chatError&&<p className="flow-error" id="agent-chat-error" role="alert">{chatError}</p>}
  </div>
 </section>
 <p className="agent-data-note">Relevant account details and recalled memories are sent to Gemini. New chats stay in this tab. Quiet Memory saves standing preferences in the background. Active autopilot may execute eligible commands within your funded consent; other actions require review.</p>
 {!expanded&&<div className="agent-chat-idle-tools">{memoryLink}</div>}
 <div className="agent-command-controls">{p.controls}<div className="agent-mode-choice"><button className="agent-text-button" onClick={()=>p.onNavigate('Autopilot')}>{p.autopilotActive?'Autopilot active · manage limits':'Set up agent autopilot'}</button><label className="checkbox-row"><input type="checkbox" checked={draftOnly} onChange={e=>setDraftOnly(e.target.checked)}/>Draft only for this message</label></div></div><div className="agent-quick-actions"><button onClick={()=>{setTopic('Describe your bill, its USDC amount and the actual people sharing it…');composer.current?.focus();}} disabled={p.disabled}><div><Utensils size={19}/><strong>Split a bill in your own words</strong><ArrowUpRight size={17}/></div><p>Your saved choices and verified payment history shape each share.</p></button><button onClick={()=>{setTopic('Tell me the USDC amount you would like to protect for 24 hours…');composer.current?.focus();}} disabled={p.disabled}><div><Shield size={19}/><strong>Prepare a 24-hour cooldown</strong><ArrowUpRight size={17}/></div><p>{p.recalled&&p.room.shield>0?formatUsdc(p.room.shield)+' USDC suggested for review.':'Choose an actual amount above your reserve.'}</p></button><button onClick={()=>p.onNavigate('Settlement')} disabled={p.disabled}><div><Zap size={19}/><strong>Settle my pending shares</strong><ArrowUpRight size={17}/></div><p>{p.pendingShares} own unsettled shares in loaded bills.</p></button><button onClick={()=>p.onNavigate('Regret')} disabled={p.disabled}><div><Brain size={19}/><strong>Review 6-hour reflections</strong><ArrowUpRight size={17}/></div><p>{p.regretCount} unrated purchases ready for a check-in.</p></button></div>
 {(p.error||localError)&&<p className="flow-error" role="alert">{p.error||localError}</p>}{!sending&&(working||p.busy)&&<LoadingState compact title="Working on your request" description="Follow a wallet prompt if one appears."/>}
 </div><StepDialog open={!!review} title="Review agent proposal" question={review? actionLabel(review.action)+'?':''} stepKey={review?.id||'agent'} onClose={()=>setReview(null)} onNext={()=>{if(!review||!reviewAllowed||splitTitleError)return;setWorking(true);setLocalError('');p.onConfirm(review,reviewingSplit?splitDetails:undefined).then(ok=>{if(ok)setReview(null);else setLocalError('The action was not completed. Check the account message before trying again.');}).catch(e=>setLocalError((e as Error).message)).finally(()=>setWorking(false));}} canNext={!p.disabled&&reviewAllowed&&!splitTitleError} busy={working||p.busy} nextLabel={reviewingSplit?'Create split':review?.action.kind==='memory'?'Sign memory update':'Continue to wallet'} error={p.error||localError} hint="Gemini proposes an action. These exact details are reviewed before your signature; the Move contract enforces payment and ownership rules.">{reviewingSplit&&<>
  <label className="flow-field"><span>Bill title</span><input className="field" value={splitDetails.title} maxLength={120} onChange={event=>setSplitDetails({...splitDetails,title:event.target.value})}/></label>
  <label className="flow-field"><span>Bill category</span><select className="field" value={splitDetails.category} onChange={event=>{const category=event.target.value;if(isBillCategory(category))setSplitDetails({...splitDetails,category});}}>{BILL_CATEGORIES.map((category:BillCategory)=><option key={category} value={category}>{BILL_CATEGORY_LABELS[category]}</option>)}</select></label>
  {splitTitleError&&<p className="field-help">{splitTitleError}</p>}
 </>}
 {review&&<ActionDetails action={review.action.kind==='split'?{...review.action,draft:{...review.action.draft,...splitDetails}}:review.action}/>}</StepDialog></section>;
}
export function AgentWorkspaceNavigation({view,onNavigate}:{view:WorkspaceView;onNavigate:(v:WorkspaceView)=>void}){
 return <nav className="agent-view-switcher" aria-label="Workspace views">{([['Agent','Agent',MessageCircle],['Expenses','Split Canvas',FileText],['Savings','Cooldown Vault',Lock],['Settlement','Escrow Desk',Wallet],['Autopilot','Autopilot',Shield]] as const).map(([value,label,Icon])=><button key={value} aria-current={view===value?'page':undefined} onClick={()=>onNavigate(value)}><Icon size={15}/>{label}{view===value?' (Active)':''}</button>)}</nav>;
}
