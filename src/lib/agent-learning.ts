import {BILL_CATEGORIES,isBillCategory,type BillCategory} from './bill-category';
import {getWalletNamespace} from './config';
import type {RecalledMemory} from './memory-protocol';

export const LEARNED_MARKER = 'SOLVENCY_LEARNED_V1';
export const LEARNED_QUERY = LEARNED_MARKER + ' standing bill category split style preferences';
export const SPLIT_STYLES = ['equal','custom','items'] as const;
export type LearningValue = BillCategory | typeof SPLIT_STYLES[number];
export interface LearningChoice {
  kind: 'bill_category' | 'split_style';
  topic: string;
  value: LearningValue | null;
}
export interface LearnedPreference extends LearningChoice {
  owner: string;
  updatedAtMs: number;
  revision: string;
}
export interface AgentExchange {user:string;reply:string;}
export const MAX_RECENT_EXCHANGES = 3;
export const MAX_EXCHANGE_CHARS = 900;
export const learnedNamespace = (wallet:string) => getWalletNamespace(wallet,'social_split_trust')+'_learned';
export const learningKey = (choice:LearningChoice) => choice.kind+':'+choice.topic;
const topicPattern = /^[\p{L}][\p{L}\p{M}\d '&.-]{0,47}$/u;
const splitWords = {equal:/\b(equal(?:ly)?|evenly|50\/50)\b/i,custom:/\b(custom|unequal)\b/i,items:/\b(itemi[sz](?:ed|ation)|line items?|by item)\b/i};

export function isLearningChoice(value:unknown):value is LearningChoice {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const {kind,topic,value:choice}=value as LearningChoice;
  if(typeof topic!=='string'||!topicPattern.test(topic)||topic!==topic.trim().toLowerCase()||/ {2}|\d{5}|\b(?:password|pin|secret|recovery|mnemonic|wallet key)\b/i.test(topic))return false;
  if(kind==='bill_category')return choice===null||isBillCategory(choice);
  return kind==='split_style'&&(choice===null||SPLIT_STYLES.some(style=>style===choice));
}

export function selectLearningChoices(raw:unknown,message:string):LearningChoice[] {
  if(!Array.isArray(raw)||raw.length>3||/[?"“”`]/u.test(message)||/\b(if|hypothetical|suppose|imagine|example|pretend|password|seed phrase|private key|api key)\b/i.test(message))return [];
  const clauses=message.split(/(?:[.!;](?=\s|$)|\r?\n)/u).map(clause=>clause.trim());
  const selected=new Map<string,LearningChoice>();
  const conflicted=new Set<string>();
  for(const entry of raw){
    if(!isLearningChoice(entry)||entry.value===null)continue;
    const {kind,topic,value}=entry;
    const evidence=(entry as LearningChoice & {evidence?:unknown}).evidence;
    if(typeof evidence!=='string'||evidence.length>240||!message.includes(evidence)||!clauses.includes(evidence.trim().replace(/[.!;]$/,''))||!evidence.toLowerCase().includes(topic))continue;
    if(!/^(?:please\s+)?(?:always\b|from now on\b|for future\b|i (?:always|prefer)\b)/i.test(evidence.trim())||/\b(?:not|never|don't|instead of|rather than)\b/i.test(evidence))continue;
    if(kind==='bill_category'&&(!/\b(categori[sz]e|classify|label|tag)\b/i.test(evidence)||!BILL_CATEGORIES.some(category=>category===value&&evidence.toLowerCase().split(/[^\p{L}]+/u).includes(category))))continue;
    if(kind==='split_style'&&(!/\bsplit\b/i.test(evidence)||!splitWords[value as keyof typeof splitWords]?.test(evidence)))continue;
    const key=learningKey(entry),previous=selected.get(key);
    if(previous&&previous.value!==value)conflicted.add(key);
    selected.set(key,{kind,topic,value});
  }
  return [...selected].filter(([key])=>!conflicted.has(key)).map(([,choice])=>choice);
}

export function latestLearnedPreferences(memories:RecalledMemory[],wallet:string):LearnedPreference[] {
  const current=new Map<string,LearnedPreference>(),namespace=learnedNamespace(wallet);
  for(const memory of memories){
    if(memory.namespace!==namespace||!memory.text.startsWith(LEARNED_MARKER+' '))continue;
    let row:LearnedPreference;
    try{row=JSON.parse(memory.text.slice(LEARNED_MARKER.length+1));}catch{continue;}
    if(!isLearningChoice(row)||row.owner!==wallet||!Number.isSafeInteger(row.updatedAtMs)||row.updatedAtMs<=0||typeof row.revision!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(row.revision))continue;
    const key=learningKey(row),previous=current.get(key);
    if(!previous||row.updatedAtMs>previous.updatedAtMs||(row.updatedAtMs===previous.updatedAtMs&&(row.value===null&&previous.value!==null||row.revision>previous.revision&&((row.value===null)===(previous.value===null)))))current.set(key,row);
  }
  return [...current.values()].sort((a,b)=>b.updatedAtMs-a.updatedAtMs);
}
