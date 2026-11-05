import {requireAddress} from './config';
import {inferBillCategory,type BillCategory} from './bill-category';
import {positiveUsdc,usdcToUnits} from './money';
import type {ExpenseItem,ExpenseMode,ExpensePerson} from './expense';
import type {OnChainContact,OnChainGroupSplit} from './onchain-user-manager';
export interface BillDraft {title:string;total:string;mode:ExpenseMode;people:ExpensePerson[];items:ExpenseItem[];conventionId?:string;category?:BillCategory;}
/** Explicit financial syntax only; unresolved names and ambiguous amounts require user edits. */
export function parseBillDraft(text:string,contacts:OnChainContact[],owner:string):BillDraft {
 if(text.length>2000)throw new Error('Keep the bill description below 2,000 characters.');
 const match=text.trim().match(/^(?:paid\s+)?\$?(\d+(?:\.\d{1,6})?)(?:\s+USDC)?\s+(?:at|for)\s+(.+?)\s*(?:\(([^()]*)\))?\s+with\s+(.+)$/i);
 if(!match)throw new Error('Include the total, a title and saved contacts: amount at place (amount food, amount drinks) with names.');
 const [,total,title,receipt,names]=match;positiveUsdc(total);
 if(!title.trim()||new TextEncoder().encode(title.trim()).length>120)throw new Error('Choose a title of 1–120 bytes.');
 const tokens=names.replace(/\s+and\s+/gi,',').split(',').map(s=>s.trim()).filter(Boolean);
 if(!tokens.length||tokens.length>64)throw new Error('Name 1–64 saved contacts.');
 const people=tokens.map((name,index)=>{
  const needle=name.replace(/^@/,'').toLocaleLowerCase(),found=contacts.filter(c=>c.handle.replace(/^@/,'').toLocaleLowerCase()===needle||c.walletAddress.toLowerCase()===needle);
  if(found.length!==1)throw new Error('Choose an unambiguous saved contact for “'+name+'”. Add or edit contacts in the account drawer.');
  return {id:'parsed-person-'+index,handle:found[0].handle,walletAddress:requireAddress(found[0].walletAddress),customAmount:'',upfront:false};
 });
 if(new Set([requireAddress(owner),...people.map(p=>p.walletAddress)]).size!==people.length+1)throw new Error('Every person must have a distinct wallet, separate from yours.');
 const items:ExpenseItem[]=receipt?receipt.split(',').map((part,index)=>{
  const item=part.trim().match(/^\$?(\d+(?:\.\d{1,6})?)(?:\s+USDC)?\s+(food|drinks|alcohol|other)$/i);
  if(!item)throw new Error('Use an amount followed by food, drinks, alcohol or other for each receipt item.');
  positiveUsdc(item[1]);const kind=item[2].toLowerCase()==='food'?'food':item[2].toLowerCase()==='other'?'other':'alcohol';
  return {id:'parsed-item-'+index,label:kind==='food'?'Food':kind==='alcohol'?'Drinks':'Other',kind,amount:item[1]};
 }):[];
 if(items.length>30)throw new Error('Use at most 30 receipt items.');
 if(items.length&&items.reduce((n,item)=>n+usdcToUnits(item.amount),0n)!==usdcToUnits(total))throw new Error('Receipt items must add up exactly to the bill total.');
 const category=inferBillCategory(title)??(items.some(item=>item.kind==='food'||item.kind==='alcohol')?'dining':undefined);
 return {title:title.trim(),total,people,items,mode:items.length?'items':'equal',...(category?{category}:{})};
}
export function repeatBillDraft(bill:OnChainGroupSplit,owner:string,contacts:OnChainContact[]):BillDraft {
 if(requireAddress(owner)!==bill.creator)throw new Error('Only repeat bills your wallet created.');
 return {title:bill.title,...(bill.category?{category:bill.category}:{}),total:String(bill.totalBillUsdc),mode:'custom',items:[],people:bill.participants.map((p,i)=>({id:'repeat-person-'+i,handle:contacts.find(c=>c.walletAddress===p.debtor)?.handle||p.debtor.slice(0,8)+'…'+p.debtor.slice(-4),walletAddress:requireAddress(p.debtor),customAmount:String(p.amountOwedUsdc),upfront:false}))};
}
