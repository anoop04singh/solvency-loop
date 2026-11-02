"use client";
import type {ReactNode} from 'react';
export const primaryViews=['Expenses','Regret','Settlement'] as const;
export type WorkspaceView=typeof primaryViews[number]|'Savings'|'Memory'|'Account'|'Agent';
const labels={Expenses:'Split a Bill',Regret:'Regret Check-In',Settlement:'Settle Shares'} as const;
export function WorkspaceNavigation({view,onChange,regretCount,settlementCount,shortcuts}:{view:WorkspaceView;onChange:(view:WorkspaceView)=>void;regretCount:number;settlementCount:number;shortcuts?:ReactNode}){
 return <nav className={'workspace-nav '+(view==='Expenses'?'split-navigation':'')} aria-label="Workspace"><div role="tablist" aria-label="Financial workspace">{primaryViews.map((item,index)=>{
  const count=item==='Regret'?regretCount:item==='Settlement'?settlementCount:null;
  return <button type="button" role="tab" key={item} id={'workspace-tab-'+item} aria-controls={'workspace-panel-'+item} aria-selected={view===item} tabIndex={view===item||!primaryViews.some(v=>v===view)&&index===0?0:-1} onClick={()=>onChange(item)} onKeyDown={event=>{
   const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
   const next=event.key==='Home'?0:event.key==='End'?primaryViews.length-1:offset?(index+offset+primaryViews.length)%primaryViews.length:-1;
   if(next<0)return;event.preventDefault();onChange(primaryViews[next]);document.getElementById('workspace-tab-'+primaryViews[next])?.focus();
  }}>{labels[item]}{count!==null&&<span className="tab-count">{count}</span>}</button>;
 })}</div>{view==='Expenses'&&shortcuts&&<div className="bill-shortcuts">{shortcuts}</div>}</nav>;
}
