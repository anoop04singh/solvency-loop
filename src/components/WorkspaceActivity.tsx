"use client";
import {createContext,useEffect,useState,type ReactNode} from 'react';
import {Check,ChevronDown,Clock3,LoaderCircle,Pause,ShieldCheck} from 'lucide-react';
import type {AgentProgress,AgentProgressStage} from '@/lib/agent-progress';
import {usePresentationMotion} from '@/lib/use-presentation-motion';

const copy:Record<AgentProgressStage,{title:string;detail:string}>={
 authorization:{title:'Authorizing access',detail:'Using your Quiet Memory session, or waiting for a wallet message approval. Follow the wallet prompt if one appears.'},
 request:{title:'Sending your request',detail:'Connecting securely to the service and waiting for its response.'},
 account:{title:'Checking your account',detail:'Reading your Sui profile, wallet balance and access to your linked memory account.'},
 personal_memory:{title:'Loading your memories',detail:'Reading saved preferences, purchase reflections and learned facts from your owned Walrus memory account.'},
 social_context:{title:'Checking shared context',detail:'Loading current public preferences and independently verified payment history for your contacts.'},
 evidence:{title:'Verifying payment history',detail:'Checking recalled payment observations against Sui receipts in small pages. Every page must finish before your insights are ready.'},
 response:{title:'Checking the result',detail:'Validating the complete response before updating your workspace.'},
 memory:{title:'Recalling relevant memories',detail:'Reading the saved context needed for this request from your linked account.'},
 bills:{title:'Loading bills and savings',detail:'Reading your shared bills and owned cooldown vaults from Sui.'},
 limits:{title:'Checking agent settings',detail:'Reading current Autopilot settings and allowance limits.'},
 reasoning:{title:'Preparing your response',detail:'Gemini is interpreting the request using the loaded account context.'},
 validation:{title:'Preparing your transaction',detail:'Building and checking the requested transaction before wallet approval.'},
 memory_write:{title:'Saving your memory update',detail:'Waiting for the requested memory update to be confirmed in your owned account.'},
 audit:{title:'Recording the action',detail:'Waiting for the action audit required by the funded allowance.'},
 execution:{title:'Waiting for Sui confirmation',detail:'The transaction was submitted. Its receipt must confirm the outcome before the app continues.'},
 refresh:{title:'Refreshing your workspace',detail:'Reading current account data after the operation. A confirmed transaction and a successful refresh are separate checks.'},
};
const signInStages:AgentProgressStage[]=['authorization','account','personal_memory','social_context','evidence','response'];
export const WorkspaceActivityContext=createContext<AgentProgress[]|null>(null);
function fact(event:AgentProgress){
 if(event.checkpoint)return 'Checkpoint #'+event.checkpoint;
 if(event.count===undefined)return '';
 const noun=event.stage==='evidence'||event.stage==='social_context'?(event.count===1?'payment proof':'payment proofs'):event.stage==='bills'?(event.count===1?'bill':'bills'):event.stage==='personal_memory'||event.stage==='memory'?(event.count===1?'memory':'memories'):(event.count===1?'record':'records');
 return event.count+' '+noun+(event.state==='active'?' checked so far':' checked');
}
/** Display observed work only. Timers measure elapsed time, never predict completion. */
export function WorkspaceActivity({events,title='Working on your request',description='Follow the live steps below. Open a step to see what it uses.',signIn=false,compact=false,inline=false,failed=false,children}:{events:AgentProgress[];title?:string;description?:string;signIn?:boolean;compact?:boolean;inline?:boolean;failed?:boolean;children?:ReactNode}){
 const preference=usePresentationMotion(),[visible,setVisible]=useState(false),[elapsed,setElapsed]=useState(0);
 useEffect(()=>{
  if(failed)return;
  setElapsed(0);
  const started=Date.now(),connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection,motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>{setVisible(!document.hidden&&!connection?.saveData&&!motion.matches);if(!document.hidden)setElapsed(Math.floor((Date.now()-started)/1000));};
  update();document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);const timer=window.setInterval(update,1000);
  return()=>{document.removeEventListener('visibilitychange',update);motion.removeEventListener('change',update);window.clearInterval(timer);};
 },[failed]);
 const moving=preference&&visible&&!failed;
 const active=events.filter(event=>event.state==='active'&&event.stage!=='request').at(-1)||events.filter(event=>event.state==='active').at(-1);
 const hideTransport=events.some(event=>event.state==='active'&&!['request','authorization'].includes(event.stage));
 const observed=[...events.filter(event=>event.state==='complete'),...events.filter(event=>event.state==='active')].filter(event=>!hideTransport||event.stage!=='request');
 const stages=signIn?signInStages:(compact?observed.slice(-3):observed).map(event=>event.stage);
 const walletTransaction=events.some(event=>event.stage==='validation');
 const stageCopy=(stage:AgentProgressStage)=>stage==='authorization'&&walletTransaction?{title:'Approve in your wallet',detail:'Review the transaction in your wallet. Submission still needs a confirmed Sui receipt before the app reports success.'}:copy[stage];
 const last=events.at(-1),current=active?stageCopy(active.stage).title:last?'Finishing this request':'Starting your request';
 const summary=failed?'Loading paused':current;
 if(inline)return <section className="workspace-activity-inline" data-motion={moving} aria-label={title}>
  <div className="workspace-activity-inline-row"><span className="workspace-activity-inline-icon" aria-hidden="true">{failed?<Pause size={22}/>:<LoaderCircle size={22}/>}</span><div><p className="workspace-activity-inline-title" role="status" aria-live="polite">{summary}</p><p className="workspace-activity-inline-description">{active?.stage==='authorization'?'Approve the message in your wallet to continue.':active?stageCopy(active.stage).detail:description}</p></div><span className="workspace-activity-time" aria-hidden="true"><Clock3 size={13}/>{elapsed?elapsed+'s elapsed':'Just started'}</span></div>
  {elapsed>=20&&!failed&&<p className="workspace-activity-inline-note">Still waiting for this step. Keep this tab open and check your wallet if approval is needed.</p>}
 </section>;
 return <section className={'workspace-activity'+(compact?' workspace-activity-compact':'')} data-motion={moving} data-failed={failed} aria-label={title} aria-busy={!failed}>
  <header className="workspace-activity-heading"><div><p className="eyebrow">{signIn?'Your personal workspace':'Live activity'}</p><h2>{title}</h2></div><span className="workspace-activity-time" aria-hidden="true"><Clock3 size={13}/>{elapsed?elapsed+'s elapsed':'Just started'}</span></header>
  <div className="workspace-activity-body"><div className="workspace-activity-overview">
   <svg className="workspace-activity-art" viewBox="0 0 160 140" fill="none" aria-hidden="true"><circle cx="80" cy="70" r="53" className="activity-art-track"/><circle cx="80" cy="70" r="39" className="activity-art-track" strokeDasharray="2 6"/><g className="workspace-activity-orbit"><circle cx="80" cy="17" r="5"/><circle cx="80" cy="123" r="3"/></g><rect x="53" y="43" width="54" height="54" rx="17" className="activity-art-center"/><path d="M80 70c-8-15-24-15-24-2s16 14 24 2 24-14 24-2-16 13-24 2Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M16 70h9m110 0h9M80 6v6m0 116v6" className="activity-art-track" strokeLinecap="round"/></svg>
   <p className="workspace-activity-current" role="status" aria-live="polite">{summary}</p><p className="workspace-activity-description">{description}</p>
   {active&&!failed&&active.stage==='authorization'&&<p className="workspace-activity-hint">Review the request if your wallet opens.</p>}
  </div><ol className="workspace-activity-steps" aria-label="Request progress">{stages.map(stage=>{
   const event=events.find(value=>value.stage===stage),state=failed&&event?.state==='active'?'paused':event?.state||'waiting';
   const name=signIn&&stage==='response'?'Preparing your dashboard':stageCopy(stage).title;
   return <li key={stage} data-state={state} aria-current={event&&event===active?'step':undefined}><details open={state==='active'||state==='paused'}><summary><span className="workspace-activity-node" aria-hidden="true">{state==='complete'?<Check size={14}/>:state==='active'?<LoaderCircle size={14}/>:state==='paused'?<Pause size={13}/>:<span/>}</span><span><strong>{name}</strong><small>{state==='complete'?'Complete':state==='active'?'In progress':state==='paused'?'Needs attention':failed?'Paused':'Waiting'}{event&&fact(event)?' · '+fact(event):''}</small></span><ChevronDown size={13} aria-hidden="true"/></summary><p>{stageCopy(stage).detail}</p></details></li>;
  })}</ol></div>
  <footer className="workspace-activity-footer"><ShieldCheck size={15} aria-hidden="true"/><p>{failed?'No partial result was marked ready. Review the account message, then retry.':elapsed>=20?'Still working on the current step. Keep this tab open; no extra action is needed unless your wallet asks.':signIn?'Your dashboard opens after all memory and evidence checks finish.':'Status follows the actual request. The confirmed result will appear when it is ready.'}</p></footer>{children&&<div className="workspace-activity-actions">{children}</div>}
 </section>;
}
