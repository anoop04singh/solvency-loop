"use client";
import {ArrowUpRight,ReceiptText} from 'lucide-react';
import type {OnChainGroupSplit} from '@/lib/onchain-user-manager';
import {BILL_CATEGORY_LABELS} from '@/lib/bill-category';
import {formatUsdc,usdcToUnits,unitsToUsdc} from '@/lib/money';

interface Props {wallet:string;bills:readonly OnChainGroupSplit[];now:number;disabled:boolean;onOpen:(id:string)=>void;onLoadEarlier?:()=>void;}
export function CreatedBillsPanel(p:Props){
 const bills=[...new Map(p.bills.filter(b=>b.creator===p.wallet).map(b=>[b.splitId,b])).values()].sort((a,b)=>b.createdAtMs-a.createdAtMs);
 return <section className="panel created-bills-panel" aria-label="Bills you created"><header className="panel-heading"><div><p className="editorial-kicker">Your split history</p><h2>Bills you created</h2><p className="panel-description">Your loaded on-chain bills, including your own share. Open a bill to see its participants and settlement status.</p></div><ReceiptText size={24} aria-hidden="true"/></header>
 {!bills.length&&<p className="field-help">No created bills in the loaded history. A confirmed split will appear here.</p>}
 <div className="created-bills-list">{bills.map(bill=>{
  const remaining=bill.isCancelled?0n:bill.participants.filter(m=>!m.isSettled).reduce((n,m)=>n+usdcToUnits(m.amountOwedUsdc),0n);
  const status=bill.isCancelled?'Cancelled':bill.isActive?(remaining===0n?'Settled':'Active'):p.now>bill.fundingDeadlineMs?'Funding expired':bill.pendingUpfront>0?'Awaiting upfront funding':'Ready to activate';
  return <article className="created-bill" key={bill.splitId}><header><div><h3>{bill.title}</h3><p className="field-help">{new Date(bill.createdAtMs).toLocaleDateString()} · {bill.category?BILL_CATEGORY_LABELS[bill.category]:'Uncategorized'}</p></div><span className="rule-badge neutral">{status}</span></header><dl><div><dt>Total bill</dt><dd>{formatUsdc(bill.totalBillUsdc)} USDC</dd></div><div><dt>Your share</dt><dd>{formatUsdc(bill.creatorShareUsdc)} USDC</dd></div><div><dt>Others still owe</dt><dd>{formatUsdc(unitsToUsdc(remaining))} USDC</dd></div></dl><footer><code title={bill.splitId}>{bill.splitId.slice(0,8)}…{bill.splitId.slice(-4)}</code><button type="button" className="button-preset" disabled={p.disabled} onClick={()=>p.onOpen(bill.splitId)}>Open bill<ArrowUpRight size={15} aria-hidden="true"/></button></footer></article>;
 })}</div>
 {p.onLoadEarlier&&<button type="button" className="button-secondary" disabled={p.disabled} onClick={p.onLoadEarlier}>Load earlier bills</button>}
 </section>;
}
