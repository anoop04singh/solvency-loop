import {isAgentProgress,type AgentProgressObserver} from './agent-progress';
import type {MemoryResponse} from './memory-api';
export interface AgentStreamError {error:string;code?:string;noFinancialExecution:boolean;}
export function agentProgressResponse(run:(progress:AgentProgressObserver)=>Promise<MemoryResponse>,failure:(error:unknown)=>AgentStreamError){
 let closed=false;
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 const stopHeartbeat=()=>{if(heartbeat!==undefined){clearInterval(heartbeat);heartbeat=undefined;}};
 const encoder=new TextEncoder();
 const stream=new ReadableStream<Uint8Array>({
  async start(controller){
   const emit=(value:unknown)=>{if(closed)return;try{controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));}catch{closed=true;stopHeartbeat();}};
   // Flush headers immediately and keep idle proxies informed during relayer
   // and chain reads. This does not extend a host's total execution limit.
   emit({type:'heartbeat'});
   heartbeat=setInterval(()=>emit({type:'heartbeat'}),5_000);
   try{const data=await run(progress=>emit({type:'progress',progress}));emit({type:'result',data});}
   catch(error){emit({type:'error',...failure(error)});}
   finally{stopHeartbeat();if(!closed){closed=true;controller.close();}}
  },
  cancel(){closed=true;stopHeartbeat();},
 });
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
export async function readAgentProgressResponse(response:Response,observer?:AgentProgressObserver):Promise<{ok:boolean;data:MemoryResponse&Partial<AgentStreamError>}>{
 if(!response.body)throw Error('The agent response stream is unavailable.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0,events=0,result:{ok:boolean;data:MemoryResponse&Partial<AgentStreamError>}|undefined;
 const consume=(line:string)=>{
  if(!line.trim())return;
  if(result)throw Error('Unexpected data after the agent result.');
  const frame=JSON.parse(line);
  if(frame.type==='heartbeat')return;
  if(frame.type==='progress'&&isAgentProgress(frame.progress)){
   if(++events>100)throw Error('Too many agent status updates.');
   try{observer?.(frame.progress);}catch{}
  }else if(frame.type==='result'&&frame.data&&typeof frame.data==='object'&&!Array.isArray(frame.data))result={ok:true,data:frame.data};
  else if(frame.type==='error'&&typeof frame.error==='string'&&typeof frame.noFinancialExecution==='boolean')result={ok:false,data:frame};
  else throw Error('Invalid agent response stream.');
 };
 try{
  while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>16*1024*1024)throw Error('The agent response is too large.');buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
  buffer+=decoder.decode();if(buffer.trim())consume(buffer);
  if(!result)throw Error('The agent response was interrupted before its result.');
  return result;
 }finally{reader.releaseLock();}
}
