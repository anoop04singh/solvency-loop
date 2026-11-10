/** Documentation artwork only. Reads sanitized evidence; never calls a wallet or API. */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {brand as C,fontCSS,markBody,artworkRenderer} from './brand-artwork.mjs';

const out=resolve('docs/assets/blog');
const scratch=resolve('.live-verification/notion-artwork/frames');
await mkdir(out,{recursive:true});
await mkdir(scratch,{recursive:true});
const evidence=JSON.parse(await readFile('docs/verification/regret-learning-evidence.json','utf8'));
const renderer=await artworkRenderer();
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rect=(x,y,w,h,fill=C.white,r=8,stroke=C.line)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+fill+'" stroke="'+stroke+'"/>';
const text=(x,y,value,size=28,weight=400,fill=C.ink,extra='')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" '+extra+'>'+esc(value)+'</text>';
const lines=(x,y,values,size=26,fill=C.muted,gap=36)=>values.map((v,i)=>text(x,y+i*gap,v,size,400,fill)).join('');
const path=(d,fill=C.ink,width=2,extra='')=>'<path d="'+d+'" fill="none" stroke="'+fill+'" stroke-width="'+width+'" stroke-linecap="round" stroke-linejoin="round" '+extra+'/>';
const arrow=(d,color=C.muted)=>path(d,color,2,'marker-end="url(#arrow)"');
const mark=(x,y,s=64)=>'<g transform="translate('+x+' '+y+') scale('+s/28+')">'+markBody+'</g>';
const label=(x,y,value,fill=C.muted)=>text(x,y,value,22,600,fill,'letter-spacing="1.8"');
const svg=(w,h,title,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><title>'+esc(title)+'</title><defs><radialGradient id="aura"><stop stop-color="#ddf1e7" stop-opacity=".7"/><stop offset="1" stop-color="#fcf9f8" stop-opacity="0"/></radialGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="'+C.muted+'"/></marker></defs><style>'+fontCSS+'text{font-family:"Hanken Grotesk",Arial,sans-serif;font-variant-numeric:tabular-nums}</style>'+rect(0,0,w,h,C.paper,0,'none')+body+'</svg>';
async function save(name,w,h,title,body){
 const source=svg(w,h,title,body);
 await writeFile(resolve(out,name+'.svg'),source);
 await renderer.png(source,w,h,resolve(out,name+'.png'));
 return source;
}
const foot=(y,value)=>path('M60 '+(y-28)+'H1140',C.line,1)+text(60,y,value,21,400,C.muted);

// Editorial cover. The brand mark is the application's actual icon.
try{
let b='<ellipse cx="1130" cy="370" rx="650" ry="540" fill="url(#aura)"/>'+mark(70,54,54)+text(140,92,'SOLVENCYLOOP',36,500,C.ink,'letter-spacing="-1.44"');
b+=path('M72 145H1528',C.line,1)+label(72,223,'THE FINANCIAL WORKSPACE');
b+=text(68,332,'Intent. Memory.',88,600,C.ink,'letter-spacing="-3.5"')+text(68,426,'On-chain proof.',88,600,C.ink,'letter-spacing="-3.5"');
b+=lines(73,502,['Describe a bill. Review the proposal.','Carry verified experience into the next decision.'],29);
b+=rect(72,628,276,52,C.ink,26,C.ink)+text(106,663,'SUI MAINNET · USDC',23,600,C.white);
b+=rect(1000,200,495,134,C.white)+label(1032,245,'01 / INTERPRET')+text(1032,295,'Gemini',39,600);
b+=rect(1000,364,495,134,C.white)+label(1032,409,'02 / REMEMBER',C.green)+text(1032,459,'Walrus Memory',39,600);
b+=rect(1000,528,495,134,C.white)+label(1032,573,'03 / ENFORCE')+text(1032,623,'Sui Move',39,600);
b+=text(1000,720,'Runtime chain connectivity through Tatum',23,400,C.muted);
await save('solvencyloop-cover',1600,780,'SolvencyLoop: conversation, memory and on-chain proof',b);

// A readable overview complements the full, preserved Mermaid source in Notion.
b=label(60,62,'01 / SYSTEM MAP')+text(60,126,'Different jobs. Explicit authority.',46,700);
b+=rect(60,180,1080,125,C.white)+text(90,228,'Workspace + authenticated application APIs',31,700);
b+=text(90,273,'Wallet owner · chat and manual flows · exact account + request checks',26,400,C.muted);
b+=arrow('M600 306V348');
const cards=[
 {x:60,title:'Walrus Memory',fill:C.mint,color:C.green,body:['Owned MemWal account','Relayer + recall index','Seal-encrypted blobs']},
 {x:430,title:'Gemini',fill:C.sky,color:C.blue,body:['Intent + selected context','Structured JSON proposal','No wallet signing']},
 {x:800,title:'Validation',fill:C.white,color:C.blue,body:['Real saved contacts','Exact micro-USDC shares','State + policy checks']}
];
for(const c of cards)b+=rect(c.x,370,340,235,c.fill)+text(c.x+25,425,c.title,31,700,c.color)+lines(c.x+25,477,c.body,25,C.muted,38);
b+=arrow('M405 485H424')+arrow('M775 485H794');
b+=text(60,651,'Recall supplies context; verified facts are committed back to memory.',25,400,C.muted);
b+=arrow('M970 606V697');
b+=rect(60,720,1080,134,C.white)+text(90,766,'Owner review OR an eligible funded policy',31,700);
b+=text(90,812,'Wallet signer / dedicated executor · audit before autonomous execution',25,400,C.muted);
b+=arrow('M600 855V902');
b+=rect(60,925,1080,122,C.ink)+text(90,972,'Shared Sui client → Tatum Mainnet /graphql',31,600,C.white);
b+=text(90,1018,'Object reads · balances · events · simulation · signed submission',25,400,'#e5e2e1');
b+=arrow('M600 1048V1092');
b+=rect(60,1115,1080,124,C.white)+text(90,1164,'Sui Move objects + confirmed events',31,700);
b+=text(90,1209,'Asset authority and invariants → reverified receipt learning → Walrus',25,400,C.muted);
b+=foot(1300,'Architecture overview · no application database · memory is not spending authority');
await save('architecture',1200,1340,'Architecture overview: wallet-scoped memory, structured intent and Sui authority',b);

// Evidence chart: real samples are intentionally separated from test-only amounts.
b=label(60,62,'03 / REGRET LEARNING')+text(60,126,'Useful context. Conservative thresholds.',44,700);
b+=rect(60,176,510,635,C.white)+rect(598,176,542,635,C.white);
b+=label(86,224,'ACTUAL WALLET HISTORY',C.green)+text(86,274,'Quotas stayed unchanged',30,700);
b+=text(86,314,'USDC · before → after · bars out of 1',23,400,C.muted);
for(const [i,key] of ['A','B','C'].entries()){
 const v=evidence.wallets[key],y=367+i*126;
 b+=text(86,y,'Wallet '+key,25,700)+text(535,y,v.quotaBefore.toFixed(2)+' → '+v.quotaAfter.toFixed(2),28,700,C.ink,'text-anchor="end"');
 b+=rect(86,y+19,440,12,C.paper,6)+rect(86,y+19,440*v.quotaAfter,12,C.green,6);
 b+=text(86,y+65,v.ratingCount+' ratings · '+v.regretted+' regretted · no shield',23,400,C.muted);
}
b+=text(86,776,'Seven owner-randomized check-ins.',23,400,C.muted);
b+=label(624,224,'CONTROLLED TEST ONLY')+text(624,274,'When the rule does react',30,700);
b+=text(624,314,'100 USDC balance · 20 reserve · 10 unpaid',22,400,C.muted);
const cases=[{title:'No qualifying pattern',quota:70,shield:0},{title:'Three qualifying regrets',quota:40,shield:30},{title:'Plus lower cash-flow context',quota:32.5,shield:37.5}];
for(const [i,c]of cases.entries()){
 const y=364+i*126,x=624,w=484;
 b+=text(x,y,c.title,25,700);
 b+=rect(x,y+23,w*.2,30,'#9a9f9b',4,'none')+rect(x+w*.2,y+23,w*.1,30,C.amber,0,'none');
 b+=rect(x+w*.3,y+23,w*c.shield/100,30,C.sky,0,'none')+rect(x+w*(.3+c.shield/100),y+23,w*c.quota/100,30,C.green,4,'none');
 b+=text(x,y+88,'Quota '+c.quota+' · shield '+c.shield+' USDC',23,400,C.muted);
}
const legend=[['#9a9f9b','Reserve'],[C.amber,'Unpaid'],[C.sky,'Shield'],[C.green,'Quota']];
for(const [i,l]of legend.entries())b+=rect(70+i*283,860,18,18,l[0],4)+text(101+i*283,878,l[1],24);
b+=lines(60,948,['A needs more regretted outcomes; B and C need more samples.','Controlled cases verify the formula, not improved consumer outcomes.'],24,C.muted,35);
await save('regret-evidence',1200,1025,'Actual unchanged quotas compared with controlled positive regret-shield tests',b);

// Readable memory counts and an exact, proportional reconciliation chart.
b=label(60,62,'04 / VERIFICATION SNAPSHOT')+text(60,126,'Real history. Reconciled funds.',46,700);
const stats=[['37','confirmed transactions'],['7','fully settled bills'],['14','settled debtor shares']];
for(const [i,s]of stats.entries()){
 const x=60+i*370;
 b+=rect(x,178,340,143,C.white)+text(x+26,246,s[0],50,600,C.ink)+text(x+26,291,s[1],23,400,C.muted);
}
b+=text(60,386,'Walrus memories · original run → after check-ins',31,700);
for(const [i,key]of ['A','B','C'].entries()){
 const before=[28,36,35][i],after=evidence.wallets[key].memoryCount,y=435+i*99,x=192,w=840/45;
 b+=text(60,y+22,'Wallet '+key,24,600)+rect(x,y,after*w,34,C.green,6,'none')+rect(x,y,before*w,34,C.sky,6,'none');
 b+=text(x+after*w+18,y+25,before+' → '+after,25,700);
}
b+=rect(60,755,1080,239,C.white)+text(87,806,'3.000000 USDC conserved across three locations',30,700);
const bx=87,bw=1026,y=842;
b+=rect(bx,y,bw*.91,40,C.ink,6,'none')+rect(bx+bw*.91,y,bw*.08,40,C.green,0,'none')+rect(bx+bw*.99,y,bw*.01,40,C.amber,3,'none');
b+=text(87,932,'Wallets  2.73',25,600,C.ink)+text(449,932,'Allowances  0.24',25,600,C.green)+text(820,932,'Cooldowns  0.03',25,600,C.amber);
b+=foot(1050,'Dated test evidence · 10 November 2026 review · executor USDC unchanged');
await save('verification-snapshot',1200,1090,'116 recalled memories and reconciliation of the original 3 USDC',b);

// Gentle, cyclic highlighting: a conceptual manual flow, not an application loader.
const steps=[
 {title:'Recall',body:'Owned memory'},
 {title:'Interpret',body:'Gemini proposal'},
 {title:'Validate',body:'Exact app rules'},
 {title:'Approve',body:'Owner review'},
 {title:'Confirm',body:'Sui receipt'},
 {title:'Remember',body:'Verified facts'}
];
function loopFrame(active,phase=0){
 let body=label(60,60,'02 / THE MANUAL LEARNING LOOP')+text(60,121,'The next split starts with more context.',42,700);
 body+=text(60,170,'Recall → propose → review → confirm → learn',26,400,C.muted);
 const pos=[[60,235],[430,235],[800,235],[800,435],[430,435],[60,435]];
 body+=arrow('M404 305H422')+arrow('M774 305H792')+arrow('M970 375V423')+arrow('M795 505H777')+arrow('M425 505H407')+arrow('M60 505H26V305H50');
 for(const [i,s]of steps.entries()){
  const [x,y]=pos[i],on=active===i;
  body+=rect(x,y,340,140,on?C.ink:C.white,8);
  body+=text(x+24,y+47,String(i+1).padStart(2,'0'),24,600,on?'#85f8c4':C.muted);
  body+=text(x+76,y+49,s.title,31,700,on?C.white:C.ink);
  body+=text(x+76,y+98,s.body,25,400,on?'#e5e2e1':C.muted);
  if(on)body+=rect(x+24,y+117,292*phase,4,'#68dba9',2,'none');
 }
 body+=text(60,627,'Conceptual flow · no live progress or success is implied by this animation.',23,400,C.muted);
 body+=text(60,668,'Autopilot instead requires a funded owner policy and a committed action audit.',23,400,C.muted);
 return svg(1200,715,'A conceptual manual loop: recall, interpret, validate, approve, confirm and remember',body);
}
await writeFile(resolve(out,'learning-loop.svg'),loopFrame(-1));
await renderer.png(loopFrame(-1),1200,715,resolve(out,'learning-loop.png'));
const framePaths=[];
for(let f=0;f<36;f++){
 const file=resolve(scratch,'frame-'+String(f).padStart(2,'0')+'.png');
 await renderer.png(loopFrame(Math.floor(f/6),(f%6+1)/6),1200,715,file);framePaths.push(file);
}
const gif=spawnSync('magick',['-delay','18',...framePaths,'-loop','0','-layers','Optimize','-colors','128',resolve(out,'learning-loop.gif')],{encoding:'utf8',windowsHide:true});
if(gif.status!==0)throw Error('GIF generation failed: '+gif.stderr);
await writeFile(resolve(out,'README.md'),[
 '# Technical article visuals','',
 'Original code-generated artwork for the Notion technical article, using the current LLM workspace identity: warm paper, charcoal, emerald, Klein blue, Hanken Grotesk and the actual infinity header mark. Sources: src/app/app/agent.css and product.css. No screenshot or financial interaction is simulated as real application evidence.','',
 '- solvencyloop-cover: editorial cover and page branding.',
 '- architecture: overview; the full source diagram remains in the article.',
 '- learning-loop.gif: conceptual manual path. learning-loop.png is the static alternative.',
 '- regret-evidence: actual unchanged quotas and separately labeled controlled test scenarios.',
 '- verification-snapshot: dated memory counts and exact USDC reconciliation.','',
 'Data source: ../../verification/regret-learning-evidence.json. Regenerate with node scripts/render-blog-visuals.mjs from the repository root; it uses local Hanken Grotesk in headless Chrome and ImageMagick. The SVGs embed the font for portable lettering. Brand exports and font-license details live in public/brand/README.md. The frame scratch directory is ignored. No network calls, signatures or memory writes are made.',''
 ].join('\n'));
console.log(JSON.stringify({output:out,assets:5,animatedFrames:36,financialCalls:0}));
}finally{await renderer.close();}
