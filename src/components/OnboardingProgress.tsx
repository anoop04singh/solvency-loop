import {Check} from 'lucide-react';

/** Presentation only: the parent remains the authority for the current step. */
export function OnboardingProgress({step,loaded}:{step:number;loaded:boolean}){
 const stages=[['Memory account','Create or find'],['Your permission','Review app access'],['Your profile','Name & reserve'],['Automation','Optional']];
 return <ol aria-label="Account setup progress" className="onboarding-progress">{stages.map(([label,description],i)=>{
  const complete=loaded&&step>i+1;
  return <li key={label} aria-current={step===i+1?'step':undefined} data-complete={complete}>
   <span className="step-number">{complete?<Check size={15} aria-hidden="true"/>:String(i+1).padStart(2,'0')}</span>
   <span className="step-copy"><strong>{label}</strong><small>{description}</small>{complete&&<span className="sr-only">Completed</span>}</span>
  </li>;
 })}</ol>;
}
