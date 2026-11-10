/** Export the existing header identity; no new application behavior or external font service. */
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {brand as C,fontCSS,markBody,markSVG,artworkRenderer} from './brand-artwork.mjs';

const out=resolve('public/brand');
await mkdir(out,{recursive:true});
const renderer=await artworkRenderer();
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,s,size=28,weight=400,color=C.ink,spacing=0)=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+color+'" letter-spacing="'+spacing+'">'+esc(s)+'</text>';
const svg=(w,h,title,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><title>'+esc(title)+'</title><style>'+fontCSS+'text{font-family:"Hanken Grotesk",Arial,sans-serif}</style>'+body+'</svg>';
const rect=(x,y,w,h,fill,rx=8)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+fill+'"/>';
const line=(x,y,w)=>'<path d="M'+x+' '+y+'h'+w+'" stroke="'+C.line+'" fill="none"/>';
try{
 await writeFile(resolve(out,'solvencyloop-mark.svg'),markSVG);
 await copyFile('node_modules/lucide-react/LICENSE',resolve(out,'LUCIDE-LICENSE.txt'));
 await writeFile('src/app/icon.svg',markSVG);
 await sharp(Buffer.from(markSVG)).resize(1024,1024).png().toFile(resolve(out,'solvencyloop-mark.png'));
 for(const size of [16,32,48,180]){
  const name=size===180?'apple-touch-icon.png':'favicon-'+size+'.png';
  await sharp(Buffer.from(markSVG)).resize(size,size).png().toFile(resolve(out,name));
 }
 await copyFile(resolve(out,'apple-touch-icon.png'),'src/app/apple-icon.png');
 const icoSizes=[16,32,48],buffers=await Promise.all(icoSizes.map(size=>sharp(Buffer.from(markSVG)).resize(size,size).png().toBuffer()));
 const header=Buffer.alloc(6+16*buffers.length);header.writeUInt16LE(1,2);header.writeUInt16LE(buffers.length,4);
 let offset=header.length;
 buffers.forEach((buffer,i)=>{const at=6+i*16;header[at]=icoSizes[i];header[at+1]=icoSizes[i];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(buffer.length,at+8);header.writeUInt32LE(offset,at+12);offset+=buffer.length;});
 await writeFile('src/app/favicon.ico',Buffer.concat([header,...buffers]));
 const size=45.714286,spacing=-size*.04;
 const wordWidth=Math.ceil(await renderer.textWidth('SOLVENCYLOOP',size,500,spacing))+4;
 for(const dark of [false,true]){
  const suffix=dark?'-dark':'',ink=dark?C.white:C.ink;
  const word=svg(wordWidth,64,'SolvencyLoop wordmark',text(0,48,'SOLVENCYLOOP',size,500,ink,spacing));
  const lockup=svg(wordWidth+84,64,'SolvencyLoop logo', '<g transform="scale(2.2857142857)">'+markBody+'</g>'+text(84,48,'SOLVENCYLOOP',size,500,ink,spacing));
  await writeFile(resolve(out,'solvencyloop-wordmark'+suffix+'.svg'),word);
  await writeFile(resolve(out,'solvencyloop-logo'+suffix+'.svg'),lockup);
  await renderer.png(lockup,wordWidth+84,64,resolve(out,'solvencyloop-logo'+suffix+'.png'));
 }
 let body=rect(0,0,1200,1220,C.paper,0);
 body+='<g transform="translate(60 52) scale(2)">'+markBody+'</g>'+text(136,93,'SOLVENCYLOOP',34,500,C.ink,-1.36);
 body+=text(60,207,'Type with a clear hierarchy.',57,600,C.ink,-2);
 body+=text(60,253,'Hanken Grotesk · the current workspace typeface',27,400,C.muted);
 body+=line(60,291,1080);
 const rows=[
  {label:'DISPLAY / 600',sample:'Money with a little memory.',size:56,weight:600,y:365},
  {label:'HEADING / 600',sample:'Your next decision, with context.',size:40,weight:600,y:510},
  {label:'BODY / 400',sample:'Describe a split. Review the proposal. Keep control.',size:30,weight:400,y:645},
  {label:'LABEL / 600 / UPPERCASE',sample:'MEMORY  /  AUTHORITY  /  ON-CHAIN PROOF',size:24,weight:600,y:780},
  {label:'FINANCIAL NUMERALS / 600',sample:'0123456789  $ €  + −  . , %',size:48,weight:600,y:915},
 ];
 for(const row of rows)body+=text(60,row.y-36,row.label,20,600,C.muted,1.6)+text(60,row.y+26,row.sample,row.size,row.weight,C.ink,row.size>=40?-.03*row.size:0)+line(60,row.y+58,1080);
 body+=text(60,1070,'Warm paper. Charcoal structure. Emerald identity.',30,600);
 const swatches=[[C.paper,'Paper'],[C.ink,'Charcoal'],[C.green,'Emerald'],[C.blue,'Klein blue'],[C.amber,'Amber']];
 swatches.forEach(([fill,name],i)=>{const x=60+i*220;body+=rect(x,1110,42,42,fill,4)+text(x+55,1140,name,21,500);});
 const specimen=svg(1200,1220,'SolvencyLoop current workspace typography and palette',body);
 await writeFile(resolve(out,'typography.svg'),specimen);
 await renderer.png(specimen,1200,1220,resolve(out,'typography.png'));
 await writeFile(resolve(out,'brand-tokens.json'),JSON.stringify({source:'src/app/app/agent.css and product.css',identity:'Swiss editorial LLM workspace',colors:C,mark:{viewBox:'0 0 28 28',cornerRadius:2,icon:'Lucide Infinity',iconSize:22,strokeWidth:2},typography:{family:'Hanken Grotesk',file:'../fonts/HankenGrotesk.ttf',license:'../fonts/HankenGrotesk-OFL.txt',wordmark:{case:'uppercase',weight:500,letterSpacing:'-0.04em'},display:{weight:600,letterSpacing:'-0.04em'},body:{weight:400},labels:{weight:600,letterSpacing:'0.08em'}}},null,2)+'\n');
 await writeFile(resolve(out,'typography.css'),'/* Current workspace typography; optional stylesheet for external brand use. */\n@font-face{font-family:"Hanken Grotesk";src:url("../fonts/HankenGrotesk.ttf") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}\n:root{--sl-font-family:"Hanken Grotesk",Arial,sans-serif;--sl-display-tracking:-.04em;--sl-label-tracking:.08em}\n.sl-brand-display{font-family:var(--sl-font-family);font-weight:600;letter-spacing:var(--sl-display-tracking)}\n.sl-brand-body{font-family:var(--sl-font-family);font-weight:400}\n.sl-brand-label{font-family:var(--sl-font-family);font-weight:600;letter-spacing:var(--sl-label-tracking);text-transform:uppercase}\n');
 await writeFile(resolve(out,'README.md'),[
 '# SolvencyLoop brand assets','',
 'This kit reproduces the current LLM workspace header: the white Lucide Infinity icon inside an emerald square with small corners, alongside the uppercase Hanken Grotesk wordmark. It replaces the former blue S favicon. Sources: src/components/AgentChrome.tsx, src/app/app/agent.css, and src/app/app/product.css.','',
 '| Asset | Use |','| --- | --- |',
 '| [solvencyloop-mark.svg](./solvencyloop-mark.svg) / [PNG](./solvencyloop-mark.png) | Standalone header mark; SVG preferred. |',
 '| [solvencyloop-logo.svg](./solvencyloop-logo.svg) / [PNG](./solvencyloop-logo.png) | Full horizontal logo on light surfaces. |',
 '| [solvencyloop-logo-dark.svg](./solvencyloop-logo-dark.svg) / [PNG](./solvencyloop-logo-dark.png) | Full logo with white lettering for dark surfaces; transparent background. |',
 '| [solvencyloop-wordmark.svg](./solvencyloop-wordmark.svg) / [dark](./solvencyloop-wordmark-dark.svg) | Typography-only uppercase wordmark. |',
 '| [typography.svg](./typography.svg) / [PNG](./typography.png) | Typeface, hierarchy, glyph and palette specimen. |',
 '| [typography.css](./typography.css) / [brand-tokens.json](./brand-tokens.json) | Reusable typography rules and current identity values. |',
 '| favicon-16.png, favicon-32.png, favicon-48.png, apple-touch-icon.png | Browser and home-screen exports. The application icon, favicon.ico and apple-icon.png are generated from the same mark. |','',
 'Logo/wordmark SVGs embed the existing Hanken Grotesk font so browsers render the intended lettering without a separate font request. They retain editable text, rather than claiming to be outlined letterforms. For other typography, use the bundled [font](../fonts/HankenGrotesk.ttf) under its [SIL Open Font License](../fonts/HankenGrotesk-OFL.txt). The infinity icon is from the installed Lucide package; its [license notice](./LUCIDE-LICENSE.txt) is included.','',
 'Keep the green mark and white infinity together. Use the dark logo on charcoal backgrounds. Leave at least half a mark width of clear space, and use the standalone mark when the wordmark would become unreadable. Warm paper is the main canvas; green identifies the brand, Klein blue supports memory/information, and amber indicates pending/attention. Never use color alone to report a financial state.','',
 'Regenerate from the repository root: node scripts/render-brand-assets.mjs. It uses local fonts and headless Chrome for exact typography and never connects to a wallet or financial API. Blog visuals use the same renderer through scripts/render-blog-visuals.mjs.',''
 ].join('\n'));
 console.log(JSON.stringify({output:out,identity:'current workspace',favicon:'header infinity mark',font:'Hanken Grotesk'}));
}finally{await renderer.close();}
