import {Shield,RefreshCw} from 'lucide-react';
import {formatUsdc} from '@/lib/money';
import type {spendingRoom} from '@/lib/financial-insights';
interface Props {room:ReturnType<typeof spendingRoom>;recalled:boolean;checkpoint:string;disabled:boolean;onRecall:()=>void;onProtect:(amount:number)=>void;}
export function SpendingOverview(p:Props){
 const parts=[{label:'Reserve setting',amount:p.room.reserve,className:'allocation-reserve'},{label:'Loaded unpaid shares',amount:p.room.unpaid,className:'allocation-bills'},{label:'Suggested spending room',amount:p.room.quota,className:'allocation-safe'},{label:'Suggested shield',amount:p.room.shield,className:'allocation-shield'}];
 return <section className="spending-overview" aria-labelledby="spending-title">
  <div className="spending-topline"><h2 id="spending-title">Safe to Spend Today</h2><p>Total Wallet Balance: <strong>{formatUsdc(p.room.balance)} USDC</strong></p></div>
  <p className="spending-number">{p.recalled?'$'+formatUsdc(p.room.quota):'—'} <span>USDC</span></p>
  <div className="allocation-bar" aria-label={p.recalled?'Wallet allocation':'Awaiting personal memory'}>{p.recalled&&parts.filter(part=>part.amount>0).map(part=><span key={part.label} className={part.className} style={{width:(p.room.balance>0?part.amount/p.room.balance*100:0)+'%'}} title={part.label+': '+formatUsdc(part.amount)+' USDC'}/>)}</div>
  <div className="metric-captions"><span><i className="allocation-reserve"/>{'$'}{formatUsdc(p.room.reserve)} reserve setting</span>{p.recalled&&p.room.shield>0?<button disabled={p.disabled} onClick={()=>p.onProtect(p.room.shield)}><Shield size={14}/>Memory suggests protecting {'$'}{formatUsdc(p.room.shield)} · Review</button>:<button disabled={p.disabled} onClick={p.onRecall}><RefreshCw size={13}/>{p.recalled?'Refresh my learning':'Load my learning'}</button>}</div>
  <details className="metric-method"><summary>{p.recalled?'Spending suggestion · '+(p.room.unpaid>0?formatUsdc(p.room.unpaid)+' USDC in loaded unpaid shares':'How this is calculated'):'Load personal memory to calculate your suggestion'}</summary><p>Balance minus your reserve setting, loaded unpaid shares and any suggested shield. Funds stay spendable in your wallet until you approve a lock. Read at checkpoint #{p.checkpoint}.{p.room.highRegret?' Current local-hour sample: '+p.room.regrettedCount+' regrets across '+p.room.sampleCount+' check-ins.':''}{p.room.elasticityApplied?' A lower current balance increased the suggested shield.':''}</p></details>
 </section>;
}
