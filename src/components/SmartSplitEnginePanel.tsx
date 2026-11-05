"use client";
import {useEffect,useState} from 'react';
import {Plus, X, Users, Utensils, Wine, ReceiptText, Lock, ArrowRight, WandSparkles, Sparkles, Pencil} from 'lucide-react';
import {computeExpense,type ExpensePerson,type ExpenseMode,type ExpenseItem} from '@/lib/expense';
import {formatUsdc,positiveUsdc,usdcToUnits,unitsToUsdc} from '@/lib/money';
import {requireAddress} from '@/lib/config';
import type {MemoryInsights,VerifiedSettlement} from '@/lib/financial-insights';
import type {OnChainContact} from '@/lib/onchain-user-manager';
import type {RecalledMemory} from '@/lib/memory-protocol';
import {SearchSelect} from './SearchSelect';
import {StepDialog,ChoiceCards} from './StepDialog';
import {BillAllocations} from './BillAllocations';
import type {BillDraft} from '@/lib/bill-draft';
import {BILL_CATEGORIES,BILL_CATEGORY_LABELS,encodeBillTitle,isBillCategory,type BillCategory} from '@/lib/bill-category';

interface Props {publicPreferences?:import('@/lib/autopilot-types').PublicSocialPreference[];initialDraft?:BillDraft|null;recentCategories?:BillCategory[];wallet:string;contacts:OnChainContact[];memories:RecalledMemory[];disabled:boolean;onInspect?:()=>void;open?:boolean;onOpen?:()=>void;onClose?:()=>void;observations?:VerifiedSettlement[];onRecall:()=>Promise<MemoryInsights>;onSmartSplit:(text:string)=>Promise<MemoryInsights&{draft:BillDraft}>;onCreate:(p:{title:string;category?:BillCategory;totalAmountUsdc:number;shares:{debtorAddress:string;amountUsdc:number;requiresUpfrontEscrow:boolean}[]})=>Promise<boolean>;}
export function SmartSplitEnginePanel(p:Props){
 const [opened,setOpened]=useState(false),[step,setStep]=useState('name'),[past,setPast]=useState<string[]>([]);
 const [category,setCategory]=useState<BillCategory|''>('');
 const [title,setTitle]=useState(''),[total,setTotal]=useState(''),[mode,setMode]=useState<ExpenseMode|''>(''),[people,setPeople]=useState<ExpensePerson[]>([]);
 const [newName,setNewName]=useState(''),[newWallet,setNewWallet]=useState(''),[customIndex,setCustomIndex]=useState(0),[items,setItems]=useState<ExpenseItem[]>([]);
 const [kind,setKind]=useState<ExpenseItem['kind']|''>(''),[itemAmount,setItemAmount]=useState(''),[itemWallets,setItemWallets]=useState<string[]>([]);
 const [insights,setInsights]=useState<MemoryInsights|null>(null),[working,setWorking]=useState(false),[error,setError]=useState('');
 const [smartText,setSmartText]=useState('');
 const [food,setFood]=useState(''),[drinks,setDrinks]=useState(''),[tactile,setTactile]=useState(false);
 const applyDraft=(draft:BillDraft)=>{setTitle(draft.title);setCategory(draft.category??'');setTotal(draft.total);setMode(draft.mode);setPeople(draft.people);setItems(draft.items);setTactile(false);setInsights(null);setError('');};
 useEffect(()=>{if(p.initialDraft){setTitle(p.initialDraft.title);setCategory(p.initialDraft.category??'');setTotal(p.initialDraft.total);setMode(p.initialDraft.mode);setPeople(p.initialDraft.people);setItems(p.initialDraft.items);setTactile(false);setInsights(null);setError('');}},[p.initialDraft]);
 const editTactile=(which:'food'|'drinks',value:string)=>{
  const amounts={food:which==='food'?value:food,drinks:which==='drinks'?value:drinks};
  setFood(amounts.food);setDrinks(amounts.drinks);setTactile(true);setMode('items');setInsights(null);
  try{
   const entries:ExpenseItem[]=[];
   if(amounts.food.trim())entries.push({id:'entered-food',label:'Food',kind:'food',amount:amounts.food});
   if(amounts.drinks.trim())entries.push({id:'entered-drinks',label:'Drinks',kind:'alcohol',amount:amounts.drinks});
   const sum=entries.reduce((n,item)=>n+positiveUsdc(item.amount),0n);
   setItems(entries);setTotal(sum>0n?String(unitsToUsdc(sum)):'');setError('');
  }catch(e){setItems([]);setTotal('');setError((e as Error).message);}
 };
 const open=p.open??opened;
 const show=(nextStep='name')=>{setStep(nextStep);setPast([]);setError('');if(p.onOpen)p.onOpen();else setOpened(true);};
 const autoSplit=async()=>{setError('');setWorking(true);try{const recalled=await p.onSmartSplit(smartText);applyDraft(recalled.draft);setInsights(recalled);}catch(e){setError((e as Error).message);}finally{setWorking(false);}};
 const reviewBill=async()=>{if(!title.trim()||!computed){show('name');return;}setError('');setWorking(true);try{setInsights(await p.onRecall());show('review');}catch(e){setError((e as Error).message);}finally{setWorking(false);}};
 const close=()=>{if(!working){setOpened(false);p.onClose?.();}};
 const go=(next:string)=>{setPast(v=>[...v,step]);setStep(next);setError('');};
 const back=()=>{if(step==='custom'&&customIndex>0){setCustomIndex(v=>v-1);return;}if(!past.length)return;setStep(past[past.length-1]);setPast(v=>v.slice(0,-1));setError('');};
 const add=(contact:OnChainContact)=>setPeople(v=>[...v,{id:crypto.randomUUID(),handle:contact.handle,walletAddress:contact.walletAddress,customAmount:'',upfront:false}]);
 let computed:ReturnType<typeof computeExpense>|null=null,validation='';
 try{if(!mode)throw new Error('Choose how to split the bill.');computed=computeExpense(p.wallet,people,total,mode||'equal',insights?.memories??p.memories,true,{items,observations:insights?.verifiedSettlements??p.observations,publicPreferences:insights?.publicPreferences??p.publicPreferences});}catch(e){validation=(e as Error).message;}
 let valid=true;
 try{
  if(step==='name'||step==='review')encodeBillTitle(title,category||undefined);
  if(step==='style')valid=!!mode;
  if(step==='item-kind')valid=!!kind;
  if(step==='total'||step==='item-amount'||step==='custom')positiveUsdc(step==='total'?total:step==='item-amount'?itemAmount:people[customIndex]?.customAmount||'');
  if(step==='people')valid=people.length>0;
  if(step==='person-name')valid=!!newName.trim();
  if(step==='person-wallet'){const a=requireAddress(newWallet);valid=a!==p.wallet&&!people.some(c=>c.walletAddress===a);}
  if(step==='item-people')valid=itemWallets.length>0;
  if(step==='item-more')valid=!!computed;
  if(step==='review')valid=!!computed&&!p.disabled;
 }catch{valid=false;}
 const questions:Record<string,string>={name:'What’s this bill for?',total:'What’s the total?',style:'How would you like to split it?',people:'Who’s sharing with you?','person-name':'What’s their name?','person-wallet':'What’s their Sui wallet?',custom:'How much does '+(people[customIndex]?.handle||'this person')+' owe?','item-kind':'What kind of item is this?','item-amount':'How much was this item?','item-people':'Who shared this item?','item-more':'Anything else on the receipt?',upfront:'Does anyone need an upfront deposit?',memory:'Refresh learning before review?',review:'Does everyone’s share look right?'};
 const next=async()=>{
  setError('');
  if(step==='name')go('total');else if(step==='total')go(tactile?'people':'style');else if(step==='style')go('people');
  else if(step==='person-name')go('person-wallet');
  else if(step==='person-wallet'){add({handle:newName.trim(),walletAddress:requireAddress(newWallet)});setNewName('');setNewWallet('');go('people');}
  else if(step==='people'){setCustomIndex(0);go(mode==='custom'?'custom':mode==='items'?(items.length?'item-more':'item-kind'):'upfront');}
  else if(step==='custom'){if(customIndex<people.length-1){setCustomIndex(v=>v+1);}else go('upfront');}
  else if(step==='item-kind')go('item-amount');
  else if(step==='item-amount'){setItemWallets([p.wallet,...people.map(c=>c.walletAddress)]);go('item-people');}
  else if(step==='item-people'){if(!kind)return;setItems(v=>[...v,{id:crypto.randomUUID(),label:({food:'Food',alcohol:'Drinks',other:'Other'}[kind])+' '+(v.length+1),kind,amount:itemAmount,wallets:itemWallets}]);setItemAmount('');setKind('');go('item-more');}
  else if(step==='item-more')go('upfront');
  else if(step==='upfront')go('memory');
  else if(step==='memory'){
   setWorking(true);try{setInsights(await p.onRecall());go('review');}catch(e){setError((e as Error).message);}finally{setWorking(false);}
  }else if(step==='review'&&computed&&!p.disabled){
   setWorking(true);try{const ok=await p.onCreate({title:title.trim(),...(category?{category}:{}),totalAmountUsdc:computed.total,shares:computed.shares.map(c=>({debtorAddress:c.walletAddress,amountUsdc:c.amountUsdc,requiresUpfrontEscrow:c.requiresUpfrontEscrow}))});if(ok){setOpened(false);setTitle('');setCategory('');setTotal('');setPeople([]);setItems([]);setInsights(null);setSmartText('');setMode('');setFood('');setDrinks('');setTactile(false);p.onClose?.();}}catch(e){setError((e as Error).message);}finally{setWorking(false);}
  }
 };
 const amountField=(label:string,value:string,change:(v:string)=>void)=><label className="flow-field"><span>{label} · USDC</span><input data-autofocus className="field flow-amount" inputMode="decimal" value={value} placeholder="0.00" onChange={e=>change(e.target.value)}/></label>;
 const everyone=[{walletAddress:p.wallet,handle:'You'},...people];
 const receiptInputs=(<div className="category-boxes tactile-inputs">{(['food','drinks'] as const).map(value=><label className="category-box" key={value}><span>{value==='food'?'Food · USDC':'Drinks · USDC'}{value==='food'?<Utensils size={18}/>:<Wine size={18}/>}</span><input aria-label={value==='food'?'Food amount · USDC':'Drinks amount · USDC'} inputMode="decimal" value={value==='food'?food:drinks} disabled={p.disabled||working} onChange={e=>editTactile(value,e.target.value)}/><small>{value==='food'?'Shared costs':'Alcohol exclusions apply after recall'}</small></label>)}</div>);
 return <><section className="panel split-workspace" aria-label="Split a bill"><form className="smart-fill" onSubmit={e=>{e.preventDefault();void autoSplit();}}><Sparkles size={19}/><input aria-label="Smart Fill bill description" value={smartText} maxLength={2000} onChange={e=>setSmartText(e.target.value)} placeholder="Amount at place (amount food, amount drinks) with saved names…" disabled={p.disabled||working}/><button className="button-preset" type="submit" disabled={p.disabled||working||!smartText.trim()}><WandSparkles size={14}/>Auto-Split</button></form>
 <div className="bill-edit-tools"><button type="button" className="button-quiet" disabled={p.disabled||working} onClick={()=>show('name')}><Pencil size={12}/>Edit bill</button><button type="button" className="button-quiet" disabled={p.disabled||working} onClick={()=>{setTactile(false);show('style');}}>Receipt & split style</button><button type="button" className="button-quiet" disabled={p.disabled||working} onClick={()=>show('people')}>People ({people.length})</button></div>
 <div className="bill-title-row"><div><p className="editorial-caps">{computed?'Bill draft · review before creating':'Your next shared bill'}</p><h2>{title||'Split a bill'}</h2></div><div className="bill-total-column"><span className="editorial-caps">Total billed</span><strong>{total?'$'+formatUsdc(Number(total)):'—'} <small>USDC</small></strong></div></div>
 <div className="bill-category-tools">
  {category&&<span className="badge">{BILL_CATEGORY_LABELS[category]}</span>}
  {!!p.recentCategories?.length&&<div className="product-actions" aria-label="Categories from recent bills"><span className="editorial-caps">From recent bills</span>{p.recentCategories.map(value=><button className="button-preset" type="button" key={value} aria-pressed={category===value} disabled={p.disabled||working} onClick={()=>setCategory(value)}>{BILL_CATEGORY_LABELS[value]}</button>)}</div>}
 </div>
 <div hidden={!!computed&&!tactile}>{receiptInputs}</div>
 {computed&&title.trim()?<BillAllocations title={title} result={computed} items={items} learnRules={p.onInspect} showHeading={false} showItems={!tactile}/>:<div className="allocation-empty"><p className="editorial-caps">Allocations ({people.length+1} participants)</p><p>{people.length?'Your people are selected. Complete the bill details to see exact shares.':'Add your people to see each share and any recalled rules.'}</p><button type="button" className="button-preset" disabled={p.disabled} onClick={()=>show('people')}><Plus size={14}/>Add people</button></div>}

 {error&&!open&&<p role="alert" className="flow-error">{error}</p>}{working&&!open&&<p role="status" className="field-help">Preparing the bill and recalling your account’s preferences. Follow a wallet signature prompt if one appears.</p>}
 <div className="bill-primary"><button className="button primary-commit" data-action-tier="primary" disabled={p.disabled||working} onClick={()=>void reviewBill()}>{computed&&title.trim()?'Create Split on Sui Mainnet':'Create an expense'}<ArrowRight size={17}/></button><p className="editorial-caps">Native Circle USDC · exact shares · wallet approval required</p></div></section>
 <StepDialog open={open} title="Split a bill" question={questions[step]} stepKey={step+(step==='custom'?customIndex:'')} onClose={close} onBack={past.length?back:undefined} onNext={()=>void next()} canNext={valid&&!p.disabled} busy={working} error={error||(step==='review'?validation:'')} stages={['Details','People','Review']} stage={['name','total','style'].includes(step)?'Details':step==='review'?'Review':'People'} nextLabel={step==='review'?'Create expense':step==='memory'?'Recall & review':step==='item-more'?'Receipt complete':'Continue'} hint={step==='review'?'These exact amounts and deposit requirements go into your Sui transaction.':step==='memory'?'Your wallet signs a personal-message request to synchronize confirmed payments and recall your own memory. No payment is made.':step==='upfront'?'Optional. These selections take priority over memory recommendations.':undefined}>
 {step==='name'&&<div className="space-y-md">
  <label className="flow-field"><span>Expense name</span><input className="field" maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label className="flow-field"><span>Bill category</span><select className="field" value={category} onChange={e=>setCategory(isBillCategory(e.target.value)?e.target.value:'')}><option value="">Uncategorized</option>{BILL_CATEGORIES.map(value=><option key={value} value={value}>{BILL_CATEGORY_LABELS[value]}</option>)}</select></label>
  {title.trim()&&!valid&&<small className="field-help">Shorten the title to fit its category and the 120-byte chain limit.</small>}
 </div>}
 {step==='total'&&(tactile?<div className="review-facts"><p>Food and drinks total: <strong>{total} USDC</strong></p><p>Derived from your entered category amounts. Edit them on the bill card.</p></div>:amountField('Total bill',total,setTotal))}
 {step==='style'&&<ChoiceCards label="How to split" value={mode} onChange={setMode} options={[{value:'equal',label:'Equally, including me',icon:<Users/>},{value:'items',label:'By receipt items',description:'Food, drinks and other items. Apply saved alcohol exclusions.',icon:<Utensils/>},{value:'custom',label:'Choose each amount',icon:<ReceiptText/>}]}/>}
 {step==='people'&&<><SearchSelect id="wizard-contacts" label="Add a saved contact" value="" onChange={v=>{const c=p.contacts.find(c=>c.walletAddress===v);if(c)add(c);}} options={p.contacts.filter(c=>!people.some(person=>person.walletAddress===c.walletAddress)).map(c=>({value:c.walletAddress,label:c.handle,description:c.walletAddress}))} disabled={people.length>=64} placeholder="Search your contacts…"/><div className="choice-people">{people.map(c=><div className="review-person" key={c.id}><span className="person-avatar">{c.handle[0]}</span><strong>{c.handle}</strong><button type="button" className="icon-button" aria-label={'Remove '+c.handle} onClick={()=>setPeople(v=>v.filter(x=>x.id!==c.id))}><X size={16}/></button></div>)}</div><button type="button" className="button-secondary" disabled={people.length>=64} onClick={()=>go('person-name')}><Plus size={15}/>Add by wallet</button><p className="field-help">You are included automatically. Add 1–64 other people.</p></>}
 {step==='person-name'&&<label className="flow-field"><span>Participant name</span><input className="field" maxLength={64} value={newName} onChange={e=>setNewName(e.target.value)}/></label>}
 {step==='person-wallet'&&<label className="flow-field"><span>Sui wallet</span><input className="field wallet-field" value={newWallet} spellCheck={false} placeholder="0x…" onChange={e=>setNewWallet(e.target.value.trim())}/><small>Enter their full, distinct Mainnet wallet address.</small></label>}
 {step==='custom'&&amountField('Share for '+people[customIndex]?.handle,people[customIndex]?.customAmount||'',v=>setPeople(all=>all.map((c,i)=>i===customIndex?{...c,customAmount:v}:c)))}
 {step==='item-kind'&&<ChoiceCards label="Receipt category" value={kind} onChange={setKind} options={[{value:'food',label:'Food',icon:<Utensils/>},{value:'alcohol',label:'Alcohol / drinks',icon:<Wine/>},{value:'other',label:'Other',icon:<ReceiptText/>}]}/>}
 {step==='item-amount'&&amountField('Item amount',itemAmount,setItemAmount)}
 {step==='item-people'&&<div className="choice-people">{everyone.map(c=><label className="choice-card" key={c.walletAddress}><input type="checkbox" checked={itemWallets.includes(c.walletAddress)} onChange={e=>setItemWallets(v=>e.target.checked?[...v,c.walletAddress]:v.filter(a=>a!==c.walletAddress))}/><strong>{c.handle}</strong></label>)}<p className="field-help">Saved alcohol exclusions are applied after recall, before the final review.</p></div>}
 {step==='item-more'&&<><div className="review-list">{items.map(c=><div className="review-person" key={c.id}><strong>{c.label}</strong><span>{c.amount} USDC</span><button type="button" className="icon-button" aria-label={'Remove '+c.label} onClick={()=>setItems(v=>v.filter(x=>x.id!==c.id))}><X size={16}/></button></div>)}</div><p className="field-help">{(()=>{try{return formatUsdc(unitsToUsdc(items.reduce((n,c)=>n+usdcToUnits(c.amount),0n)))+' of '+total+' USDC entered';}catch{return 'Check your item amounts.';}})()}</p><button type="button" className="button-secondary" disabled={items.length>=30} onClick={()=>go('item-kind')}>Add another item</button>{!computed&&<p className="field-help">{validation}</p>}</>}
 {step==='upfront'&&<div className="choice-people">{people.map(c=><label className="choice-card" key={c.id}><input type="checkbox" checked={c.upfront} onChange={e=>setPeople(v=>v.map(x=>x.id===c.id?{...x,upfront:e.target.checked}:x))}/><strong>{c.handle}</strong></label>)}</div>}
 {step==='memory'&&<div className="review-facts"><p>Recall your saved alcohol-sharing preferences and verify real settlement history before calculating the final shares.</p><p>New accounts start with no observations. Only your explicit choices apply until enough verified history exists. No trust score or payment record is fabricated.</p></div>}
 {step==='review'&&computed&&<div className="share-review"><div className="share-review-total"><span>{title}{category&&<small className="field-help"> · {BILL_CATEGORY_LABELS[category]}</small>}</span><strong>{formatUsdc(computed.total)} USDC</strong></div>{mode==='items'&&<div className="receipt-review">{items.map(item=><div key={item.id}><span>{item.label}</span><strong>{item.amount} USDC</strong></div>)}</div>}<div className="share-line"><span>You</span><strong>{formatUsdc(computed.creatorShare)} USDC</strong></div>{computed.shares.map(c=><div className="share-line" key={c.walletAddress}><div><strong>{c.handle}</strong><small className="review-wallet" title={c.walletAddress}>{c.walletAddress.slice(0,6)}…{c.walletAddress.slice(-4)}</small><small className="share-rule" data-upfront={c.requiresUpfrontEscrow}>{c.ruleApplied}</small>{c.excludedItems.length>0&&<small className="rule-pill">Excluded: {c.excludedItems.join(', ')}</small>}{c.history.count>0&&<small className="field-help">{c.history.count} verified payments above threshold · average {(c.history.averageLagMs/86400000).toFixed(1)} days · {c.history.onTimeRate}% within 24h</small>}</div><span className="share-amount">{c.requiresUpfrontEscrow&&<small className="escrow-badge"><Lock size={11}/>Escrow</small>}<strong>{formatUsdc(c.amountUsdc)} USDC</strong></span></div>)}{!!insights?.rejectedEvidenceCount&&<p className="field-help">{insights.rejectedEvidenceCount} recalled observations did not pass chain verification and were excluded.</p>}<p className="field-help">Adaptive deposits: above 40 USDC unless you saved another threshold; at least 3 of the latest 5 qualifying payments, average over 7 days. Average at most 24h restores standard settlement. Manual rules take priority. These samples do not guarantee repayment.</p><p className="field-help">Upfront deposits remain in escrow until activation. Bill details are public. Your wallet will ask you to approve.</p></div>}
 </StepDialog></>;
}
