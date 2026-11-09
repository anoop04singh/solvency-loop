"use client";
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { usePresentationMotion } from '@/lib/use-presentation-motion';
import {LoadingState} from './LoadingState';
import {useModalScrollLock} from '@/lib/use-modal-scroll-lock';

interface Props { open:boolean; title:string; question:string; stepKey:string; children:ReactNode; onClose:()=>void; onNext:()=>void; onBack?:()=>void; nextLabel?:string; canNext?:boolean; busy?:boolean; error?:string; hint?:string; stages?:string[]; stage?:string; className?:string; }
export function StepDialog(p:Props) {
  const dialog=useRef<HTMLDialogElement>(null),body=useRef<HTMLDivElement>(null),id=useId(),moving=usePresentationMotion();
  useModalScrollLock(p.open);
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    if(p.open&&!element.open)element.showModal();if(!p.open&&element.open)element.close();
    if(!p.open)return;
    return()=>{element.close();};
  },[p.open]);
  useEffect(()=>{
    if(!p.open)return;
    const timer=window.setTimeout(()=>body.current?.querySelector<HTMLElement>('[data-autofocus], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)')?.focus({preventScroll:true}),moving?190:0);
    return()=>window.clearTimeout(timer);
  },[p.open,p.stepKey,moving]);
  return <dialog ref={dialog} className={['flow-dialog',p.className].filter(Boolean).join(' ')} aria-labelledby={id+'-question'} aria-describedby={p.hint?id+'-hint':undefined} onCancel={event=>{event.preventDefault();if(!p.busy)p.onClose();}} onClick={event=>{if(event.target===event.currentTarget&&!p.busy)p.onClose();}} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0);
    const first=controls[0],last=controls[controls.length-1];
    if(!first){event.preventDefault();return;}
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }}>
    <form className="flow-sheet" aria-busy={p.busy||undefined} onSubmit={event=>{event.preventDefault();if(p.canNext!==false&&!p.busy)p.onNext();}}>
      <header className="flow-top"><span>{p.title}</span><button type="button" className="icon-button" aria-label={'Close '+p.title.toLowerCase()} disabled={p.busy} onClick={p.onClose}><X size={18}/></button></header>
      {p.stages&&<ol className="flow-stages" aria-label="Progress">{p.stages.map(label=><li key={label} aria-current={label===p.stage?'step':undefined}>{label}</li>)}</ol>}
      <div className="flow-scroll"><h2 id={id+'-question'}>{p.question}</h2>{p.hint&&<p id={id+'-hint'} className="flow-hint">{p.hint}</p>}
        <AnimatePresence mode="wait" initial={false}><motion.div key={p.stepKey} ref={body} className="flow-content" initial={moving?{opacity:0,y:8}:false} animate={{opacity:1,y:0}} exit={moving?{opacity:0,y:-5}:undefined} transition={{duration:.16}}><fieldset disabled={p.busy}>{p.children}</fieldset></motion.div></AnimatePresence>
        {p.error&&<p className="flow-error" role="alert">{p.error}</p>}
        {p.busy&&<LoadingState compact title="Waiting for your request" description="Follow a wallet prompt if one appears. Please wait for the confirmed result."/>}
      </div>
      <footer className="flow-footer">{p.onBack?<button type="button" className="button-secondary" disabled={p.busy} onClick={p.onBack}><ArrowLeft size={16} aria-hidden="true"/>Back</button>:<button type="button" className="button-secondary" disabled={p.busy} onClick={p.onClose}>Cancel</button>}<button type="submit" className="button primary-commit" data-action-tier="primary" disabled={p.canNext===false||p.busy}>{p.busy?'Please wait…':p.nextLabel||'Continue'}{!p.busy&&<ArrowRight size={16} aria-hidden="true"/>}</button></footer>
    </form>
  </dialog>;
}

export function ChoiceCards<T extends string>({label,value,options,onChange}:{label:string;value:T;options:{value:T;label:string;description?:string;icon?:ReactNode}[];onChange:(value:T)=>void}) {
  const name=useId();
  return <fieldset className="choice-cards"><legend className="sr-only">{label}</legend>{options.map(option=><label className="choice-card" key={option.value} data-selected={value===option.value}><input type="radio" name={name} value={option.value} checked={value===option.value} onChange={()=>onChange(option.value)}/>{option.icon&&<span className="choice-icon" aria-hidden="true">{option.icon}</span>}<span><strong>{option.label}</strong>{option.description&&<small>{option.description}</small>}</span></label>)}</fieldset>;
}
