"use client";
import {useState} from 'react';
import {Check,ChevronDown,LoaderCircle} from 'lucide-react';
import type {AgentProgress,AgentProgressStage} from '@/lib/agent-progress';
import {usePresentationMotion} from '@/lib/use-presentation-motion';
const steps:Record<AgentProgressStage,{title:string;data:string}>={
 authorization:{title:'Authorizing your request',data:'Your existing Quiet Memory grant or a wallet message authorizes this account-scoped request.'},
 request:{title:'Connecting to your agent',data:'Sending your signed message and recent chat context, authorized for your linked memory account.'},
 account:{title:'Checking your account',data:'Reading your Sui profile, contacts, USDC balance and linked MemWal access.'},
 memory:{title:'Recalling relevant memory',data:'Reading saved preferences, check-ins and shared context from your owned memory account.'},
 personal_memory:{title:'Loading your memories',data:'Reading your saved preferences, check-ins and learned facts.'},
 social_context:{title:'Loading shared context',data:'Reading current public preferences and verifying shared payment history.'},
 evidence:{title:'Verifying recalled evidence',data:'Checking recalled payment observations against actual Sui receipts.'},
 bills:{title:'Reading your bills',data:'Loading your Sui splits and, where needed, owned cooldown vaults.'},
 limits:{title:'Checking Autopilot limits',data:'Reading the current allowance. Funded actions still require the approved account, scope, limits and expiry.'},
 reasoning:{title:'Interpreting your request',data:'Gemini is preparing an intent using the loaded account data, recent chat context and recalled memory.'},
 validation:{title:'Checking the proposal',data:'Validating contacts, exact USDC amounts, bill state and the requested action.'},
 memory_write:{title:'Saving your requested update',data:'Committing the explicit memory action to your own account.'},
 audit:{title:'Saving the action audit',data:'A confirmed audit record is required before this funded financial action can proceed.'},
 execution:{title:'Processing the funded action',data:'Checking and processing the eligible request. Read the actual transaction status in the final reply.'},
 response:{title:'Validating the reply',data:'Checking that the result belongs to your signed request before displaying any action.'},
 refresh:{title:'Refreshing your workspace',data:'Reading the latest bills, balances and account state after the agent result.'},
};
function facts(event:AgentProgress){return [event.count===undefined?'':event.count+' '+(event.stage==='memory'?'memories':event.stage==='evidence'?'verified observations':'loaded bills'),event.checkpoint?'Checkpoint #'+event.checkpoint:''].filter(Boolean).join(' · ');}
export function AgentActivityTimeline({events}:{events:AgentProgress[]}){
 const [expanded,setExpanded]=useState(false);
 const moving=usePresentationMotion();
 const active=events.filter(e=>e.state==='active'),current=active.at(-1);
 const visible=expanded?events:events.slice(-4);
 return <section className="agent-activity" data-motion={moving} aria-label="Agent activity" aria-live="off"><header><svg className="agent-activity-graphic" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24"/><path d="M15 28c0-13 13-13 13 0s13 13 13 0-13-13-13 0-13 13-13 0Z"/><circle className="activity-orbit" cx="28" cy="4" r="3"/></svg><div><h3>Working on your request</h3><p role="status">{current?steps[current.stage].title:events.length?'Preparing the next update…':'Starting your request…'}</p></div></header>
 <ol>{visible.map(event=><li key={event.stage} data-state={event.state}><details open={event.state==='active'}><summary><span className="activity-node" aria-hidden="true">{event.state==='complete'?<Check size={13}/>:<LoaderCircle size={13}/>}</span><span><strong>{steps[event.stage].title}</strong><small>{event.state==='complete'?'Checked':'In progress'}{facts(event)?' · '+facts(event):''}</small></span><ChevronDown size={13} aria-hidden="true"/></summary><p>{steps[event.stage].data}</p></details></li>)}</ol>
 {events.length>4&&<button type="button" className="agent-text-button" onClick={()=>setExpanded(v=>!v)}>{expanded?'Show recent steps':'Show all '+events.length+' steps'}</button>}
 <small className="activity-footnote">Live request stages · open a step to see what data it uses</small></section>;
}
