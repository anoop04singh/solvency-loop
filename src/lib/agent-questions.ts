import type {OnChainGroupSplit} from './onchain-user-manager';
import {formatUsdc} from './money';

export function isPendingSplitsQuestion(text:string):boolean{
 return /^(?:(?:please\s+|can you\s+)?(?:show|list|check)\s+(?:me\s+)?|what\s+(?:are|about)\s+|do i have\s+(?:any\s+)?)?(?:all\s+)?(?:my\s+)?(?:pending|unpaid|outstanding)\s+(?:splits?|bills?|shares?)[\s?.!]*$/i.test(text.trim());
}

export function isAgentReadQuestion(text:string):boolean{
 const request=text.trim();
 return isPendingSplitsQuestion(request)||/^(?:please\s+|can you\s+)?(?:what|which|how|when|where|who|why|show|list|check|summarize|tell me|do i|am i|is there|are there)\b/i.test(request);
}

export function pendingSplitsReply(wallet:string,splits:OnChainGroupSplit[],hasMore:boolean):string{
 const rows=splits.flatMap(bill=>{
  if(bill.isCancelled)return [];
  const outstanding=bill.participants.filter(share=>!share.isSettled);
  const own=outstanding.find(share=>share.debtor===wallet);
  const label=bill.title.trim().replace(/\s+/g,' ')||'Untitled bill';
  if(own){
   const status=own.isFunded?'funded in escrow':bill.isActive?'unpaid':own.requiresUpfrontEscrow?'upfront deposit pending':'waiting for activation';
   return [label+' · Your share is '+formatUsdc(own.amountOwedUsdc)+' USDC · '+status];
  }
  return bill.creator===wallet&&outstanding.length?[label+' · '+outstanding.length+' outstanding '+(outstanding.length===1?'share':'shares')]:[];
 });
 const summary=rows.length?'Pending splits in the bills checked:\n'+rows.slice(0,10).map(row=>'• '+row).join('\n'):'There are no pending splits in the bills checked.';
 return summary+(hasMore||rows.length>10?'\nOpen the Escrow Desk to see more bills.':'');
}
