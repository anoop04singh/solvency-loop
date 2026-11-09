export const AGENT_PROGRESS_STAGES=['authorization','request','account','memory','evidence','bills','limits','reasoning','validation','memory_write','audit','execution','response','refresh'] as const;
export type AgentProgressStage=typeof AGENT_PROGRESS_STAGES[number];
export interface AgentProgress {stage:AgentProgressStage;state:'active'|'complete';at:number;count?:number;checkpoint?:string;}
export type AgentProgressObserver=(event:AgentProgress)=>void;
export function isAgentProgress(value:unknown):value is AgentProgress {
 if(!value||typeof value!=='object')return false;
 const p=value as AgentProgress;
 return AGENT_PROGRESS_STAGES.includes(p.stage)&&['active','complete'].includes(p.state)&&Number.isSafeInteger(p.at)&&p.at>0&&(p.count===undefined||Number.isSafeInteger(p.count)&&p.count>=0)&&(p.checkpoint===undefined||typeof p.checkpoint==='string'&&/^\d+$/.test(p.checkpoint));
}
export function notifyAgentProgress(observer:AgentProgressObserver|undefined,stage:AgentProgressStage,state:AgentProgress['state'],facts:Pick<AgentProgress,'count'|'checkpoint'>={}){
 // Presentation observers cannot interrupt an authorized request.
 try{observer?.({stage,state,at:Date.now(),...facts});}catch{}
}
export function mergeAgentProgress(events:AgentProgress[],event:AgentProgress){
 const previous=events.find(p=>p.stage===event.stage);
 if(previous?.state==='complete'&&event.state==='active')return events;
 return previous?events.map(p=>p.stage===event.stage?event:p):[...events,event];
}
