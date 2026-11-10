import {createHash} from 'node:crypto';
import {decodeBillTitle} from './bill-category';
import type {MemWal} from '@mysten-incubation/memwal';
import {autopilotConfig,autopilotObject,fetchAutopilotState,fetchPublicPreference,moveFields} from './autopilot-onchain';
import type {PublicSocialPreference,GroupConvention} from './autopilot-types';
import {contractConfig,requireAddress,SUI_MAINNET_USDC_TYPE} from './config';
import {tatumSuiClient} from './tatum-rpc-client';
import type {OnChainUserProfile} from './onchain-user-manager';
import type {RecalledMemory} from './memory-protocol';
import {memoryRecord,type VerifiedSettlement} from './financial-insights';
import {settlementReadScope,verifyRecalledSettlements} from './memory-evidence';
import {commitMemoryBatch} from './memory-batch';
export const NETWORK_COMMONS='sl_network_commons';
export function publicBillBenchmarks(bills:{id:string;title:string;totalUnits:string;people:number}[]){
 const groups=new Map<string,typeof bills>();for(const b of bills){const key=b.title.trim().toLowerCase();if(!key||!Number.isInteger(b.people)||b.people<2||b.people>65||!/^\d+$/.test(b.totalUnits)||BigInt(b.totalUnits)<=0n)continue;const old=groups.get(key)||[];if(!old.some(x=>x.id===b.id))groups.set(key,[...old,b]);}
 return [...groups.values()].filter(g=>g.length>=3).map(g=>{const amounts=g.map(b=>BigInt(b.totalUnits)/BigInt(b.people));return {label:g[0].title,count:g.length,meanPerParticipantUnits:(amounts.reduce((n,x)=>n+x,0n)/BigInt(amounts.length)).toString(),minPerParticipantUnits:amounts.reduce((n,x)=>n<x?n:x).toString(),maxPerParticipantUnits:amounts.reduce((n,x)=>n>x?n:x).toString(),sourceSplitIds:g.map(b=>b.id),method:'Observed public bill total divided by participant count; titles are not verified merchant identities.'};});
}
export interface SocialContext {publicPreferences:PublicSocialPreference[];groups:GroupConvention[];networkSettlements:VerifiedSettlement[];memories:RecalledMemory[];}
export async function loadSocialContext(profile:OnChainUserProfile,client:Pick<MemWal,'recall'|'rememberBulkAndWait'>,publish=false):Promise<SocialContext>{
 const empty:SocialContext={publicPreferences:[],groups:[],networkSettlements:[],memories:[]},c=autopilotConfig();if(!c)return empty;
 const evidence=settlementReadScope({transaction:p=>tatumSuiClient.getTransactionBlock(p),object:p=>tatumSuiClient.getObject(p)});
 const directory=await autopilotObject(c.directoryId,'AgentDirectory'),publicPreferences:PublicSocialPreference[]=[];
 for(let i=0;i<profile.contacts.length;i+=8){const rows=await Promise.all(profile.contacts.slice(i,i+8).map(p=>fetchPublicPreference(p.walletAddress,directory)));publicPreferences.push(...rows.filter((p):p is PublicSocialPreference=>!!p&&p.active));}
 const own=await fetchAutopilotState(profile.wallet),groups=own.groups.filter(g=>g.members.every(m=>m.approved));
 const recalled=await client.recall({namespace:NETWORK_COMMONS,query:'SOLVENCY_PUBLIC_SETTLEMENT_V1 public verified payment velocity group conventions',topK:40});if(recalled.dropped_count)throw Error('Shared social memory could not be decrypted. Restore it before continuing.');
 const known=new Set(profile.contacts.map(p=>p.walletAddress)),candidates:Record<string,unknown>[]=[];
 for(const m of recalled.results){const r=memoryRecord(m.text,'SOLVENCY_PUBLIC_SETTLEMENT_V1');if(r&&known.has(String(r.subject)))candidates.push(r);}
 const {packageId}=contractConfig(),events=await tatumSuiClient.queryEvents({query:{MoveEventType:packageId+'::core::ShareSettledEvent'},limit:50,order:'descending'});
 const seen=new Set<string>();
 for(const event of events.data){const r=event.parsedJson as Record<string,unknown>;if(!r||!known.has(String(r.payer))||seen.has(event.id.txDigest+':'+event.id.eventSeq))continue;seen.add(event.id.txDigest+':'+event.id.eventSeq);if(seen.size>10)break;
  const obj=await evidence.object({id:requireAddress(r.split_id),options:{showContent:true}});if(obj.error||obj.data?.content?.dataType!=='moveObject'||obj.data.content.type!==packageId+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>')throw Error('A shared settlement source is unavailable or has the wrong token.');
  const createdAtMs=Number(moveFields(obj.data.content.fields).created_at_ms);candidates.push({digest:event.id.txDigest,eventSeq:event.id.eventSeq,splitId:r.split_id,subject:r.payer,recipient:r.recipient,amountUnits:String(r.amount),lagMs:Number(r.settled_at_ms)-createdAtMs,settledAtMs:Number(r.settled_at_ms)});
 }
 const networkSettlements:VerifiedSettlement[]=[];
 const recipients=[...new Set(candidates.map(r=>requireAddress(r.recipient)))];
 for(const recipient of recipients){const records=candidates.filter(r=>r.recipient===recipient).slice(0,20).map(r=>({blob_id:'chain-candidate',text:'SOLVENCY_SETTLEMENT_V1 '+JSON.stringify(r),category:'social_split_trust' as const,namespace:NETWORK_COMMONS}));
  const verified=await verifyRecalledSettlements(records,recipient,evidence);networkSettlements.push(...verified.verifiedSettlements.map(s=>({...s,network:true})));
 }
 const selected=[...new Map(networkSettlements.map(s=>[s.digest+':'+s.eventSeq,s])).values()].sort((a,b)=>b.settledAtMs-a.settledAtMs).slice(0,20);
 if(!publish)return {publicPreferences,groups,networkSettlements:selected,memories:[]};
 const observed:{id:string;title:string;totalUnits:string;people:number}[]=[];
 const billEvents=await tatumSuiClient.queryEvents({query:{MoveEventType:packageId+'::core::SplitCreatedEvent'},limit:50,order:'descending'});
 for(const e of billEvents.data){const data=e.parsedJson as Record<string,unknown>;if(data.creator!==profile.wallet&&!known.has(String(data.creator)))continue;if(observed.length>=20)break;
  const object=await evidence.object({id:requireAddress(data.split_id),options:{showContent:true}});if(object.error||object.data?.content?.dataType!=='moveObject'||object.data.content.type!==packageId+'::core::GroupSplitEscrow<'+SUI_MAINNET_USDC_TYPE+'>')throw Error('A public bill benchmark source could not be verified.');
  const f=moveFields(object.data.content.fields),entries=moveFields(f.participants).contents;if(f.creator!==data.creator||String(f.total_bill_amount)!==String(data.total_amount)||f.title!==data.title||!Array.isArray(entries))throw Error('Public bill benchmark event mismatch.');observed.push({id:object.data.objectId,title:decodeBillTitle(String(f.title)).title,totalUnits:String(f.total_bill_amount),people:entries.length+1});
 }
 const publicRecords=[...publicPreferences.map(p=>'SOLVENCY_PUBLIC_PREF_V1 '+JSON.stringify(p)),...groups.map(g=>'SOLVENCY_GROUP_V1 '+JSON.stringify(g)),...selected.map(s=>'SOLVENCY_PUBLIC_SETTLEMENT_V1 '+JSON.stringify({...s,subject:s.payer})),...publicBillBenchmarks(observed).map(b=>'SOLVENCY_BILL_BENCHMARK_V1 '+JSON.stringify(b))];
 const key=createHash('sha256').update(JSON.stringify(publicRecords)).digest('hex');
 const memories=await commitMemoryBatch(client,publicRecords.map(text=>({text,namespace:NETWORK_COMMONS,category:'social_split_trust'})),'commons:'+profile.wallet+':'+key);
 // Only live, independently verified public data is used. A revoked profile or
 // stale/unverified recalled social claim never becomes a current preference.
 return {publicPreferences,groups,networkSettlements:selected,memories};
}
