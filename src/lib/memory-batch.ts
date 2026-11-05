import type {MemWal} from '@mysten-incubation/memwal';
import type {RecalledMemory} from './memory-protocol';
export type BatchWriter=Pick<MemWal,'rememberBulkAndWait'>;
export async function commitMemoryBatch(client:BatchWriter,items:{text:string;namespace:string;category:RecalledMemory['category']}[],key:string){
 const memories:RecalledMemory[]=[];
 for(let i=0;i<items.length;i+=20){const chunk=items.slice(i,i+20),result=await client.rememberBulkAndWait(chunk.map(({text,namespace})=>({text,namespace})),{timeoutMs:120000,idempotencyKey:key+':'+i/20});
  if(result.total!==chunk.length||result.results.length!==chunk.length||result.failed!==0||result.succeeded!==chunk.length||result.results.some((r,j)=>r.status!=='done'||!r.id||!r.blob_id||r.namespace!==chunk[j].namespace))throw Error('A Walrus memory batch is incomplete. Check its jobs before resubmitting; no complete learning is claimed.');
  result.results.forEach((r,j)=>memories.push({blob_id:r.blob_id,...chunk[j]}));
 }
 return memories;
}
