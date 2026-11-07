import {BILL_CATEGORY_LABELS,encodeBillTitle,inferBillCategory,isBillCategory,type BillCategory} from './bill-category';
import {prepareAgentAction,type AgentContext} from './agent-action';
import {positiveUsdc} from './money';

export interface SplitContinuation {
  amount:string;
  people:string[];
  title:string;
  category:BillCategory;
}

const walletPattern=/^0x[\da-f]{64}$/i;
const contactKey=(name:string)=>name.trim().replace(/^@/,'').toLowerCase();
const validPerson=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&(walletPattern.test(value)||new TextEncoder().encode(value.trim().replace(/^@/, '')).length<=64);
const validAmount=(value:unknown):value is string=>{
  if(typeof value!=='string'||value.length>40)return false;
  try{positiveUsdc(value);return true;}catch{return false;}
};

export function isSplitContinuation(value:unknown):value is SplitContinuation{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const split=value as SplitContinuation;
  if(!validAmount(split.amount)||!Array.isArray(split.people)||split.people.length<1||split.people.length>64||!split.people.every(validPerson)||new Set(split.people.map(contactKey)).size!==split.people.length||!isBillCategory(split.category)||typeof split.title!=='string')return false;
  try{encodeBillTitle(split.title,split.category);return true;}catch{return false;}
}

export function equalSplitContinuation(value:unknown):SplitContinuation|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const draft=value as Record<string,unknown>;
  if(draft.action!=='split'||draft.includeCreator!==true||draft.currency&&draft.currency!=='USDC'||draft.groupId||!Array.isArray(draft.items)||draft.items.length||!Array.isArray(draft.people))return;
  if(draft.people.some(person=>!person||typeof person!=='object'||person.amount!=null||person.upfront===true||person.excludeAlcohol===true))return;
  const title=typeof draft.title==='string'&&draft.title.trim()?draft.title.trim():'Shared expense';
  const split={amount:draft.amount,people:draft.people.map(person=>person.contact),title,category:isBillCategory(draft.billCategory)?draft.billCategory:inferBillCategory(title)??'other'};
  if(isSplitContinuation(split))return split;
}

/** A narrow recovery path for an explicit, one-peer equal split that Gemini asked to clarify. */
export function literalEqualSplit(message:string):SplitContinuation|undefined{
  const match=/^(?:please\s+)?split\s+(\d+(?:\.\d{1,6})?)\s*(?:USDC\s+)?(?:between\s+me\s+and|with)\s+(@?[\p{L}\p{N}_.-]+)\s*[.!]?$/iu.exec(message.trim());
  const split=match&&{amount:match[1],people:[match[2]],title:'Shared expense',category:'other'};
  if(isSplitContinuation(split))return split;
}

function missingContact(split:SplitContinuation,c:AgentContext){
  return split.people.find(name=>!c.profile.contacts.some(contact=>contactKey(contact.handle)===contactKey(name)||contact.walletAddress===contactKey(name)));
}

export function bindSplitContact(split:SplitContinuation,name:string,wallet:string):SplitContinuation{
  return {...split,people:split.people.map(person=>contactKey(person)===contactKey(name)?wallet:person)};
}

export function prepareContinuedSplit(split:SplitContinuation,c:AgentContext){
  const missing=missingContact(split,c);
  if(missing)return {action:{kind:'none' as const},reply:'I kept the '+split.amount+' USDC split. Paste the full Sui wallet address for '+missing+' to continue.'};
  return prepareAgentAction({action:'split',includeCreator:true,currency:'USDC',amount:split.amount,title:split.title,billCategory:split.category,people:split.people.map(contact=>({contact,amount:null,upfront:false,excludeAlcohol:false})),items:[]},c);
}

export function splitFollowUp(split:SplitContinuation,message:string,c:AgentContext){
  const text=message.trim().replace(/[.!]$/,'');
  const address=/^(?:(?:this is|here is) (?:the |their )?(?:wallet )?address[:\s]+)?(0x[\da-f]{64})$/i.exec(text)?.[1].toLowerCase();
  const name=address?missingContact(split,c):undefined;
  if(address&&name){
    if(c.profile.contacts.some(contact=>contact.walletAddress===address)){
      const pending=bindSplitContact(split,name,address);
      return {pending,prepared:prepareContinuedSplit(pending,c)};
    }
    return {pending:split,prepared:prepareAgentAction({action:'contact',handle:name.replace(/^@/,''),wallet:address},c)};
  }
  const category=text.toLowerCase();
  if(isBillCategory(category)){
    const title=split.title==='Shared expense'?BILL_CATEGORY_LABELS[category]+' split':split.title;
    const pending={...split,category,title};
    return {pending,prepared:prepareContinuedSplit(pending,c)};
  }
  if(/^(?:please\s+)?(?:make|create|prepare|continue|review)\s+(?:the\s+|this\s+|my\s+)?split$/i.test(text))return {pending:split,prepared:prepareContinuedSplit(split,c)};
}
