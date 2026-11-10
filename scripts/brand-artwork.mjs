/** Shared documentation/brand renderer. Uses the current workspace, not legacy theme tokens. */
import {readFile} from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Infinity as Loop} from 'lucide-react';
import {chromium} from '@playwright/test';

const product=await readFile('src/app/app/product.css','utf8');
const agent=await readFile('src/app/app/agent.css','utf8');
const color=name=>{
 const value=(agent+'\n'+product).match(new RegExp('--'+name+':(#[0-9a-fA-F]{6})(?:[;}])'))?.[1];
 if(!value)throw Error('Missing current workspace token: '+name);
 return value;
};
export const brand={
 paper:color('agent-paper'),ink:color('agent-ink'),muted:color('agent-muted'),
 green:color('agent-green'),blue:color('agent-blue'),line:color('product-line'),
 stone:color('agent-stone'),soft:color('product-soft'),amber:color('product-amber'),
 white:'#ffffff',sky:'#dbe1ff',mint:'#e3eee8',sand:'#fff0df',
};
const font=await readFile('public/fonts/HankenGrotesk.ttf');
export const fontCSS='@font-face{font-family:"Hanken Grotesk";src:url(data:font/ttf;base64,'+font.toString('base64')+') format("truetype");font-style:normal;font-weight:100 900;font-display:block}';
const lucide=renderToStaticMarkup(createElement(Loop,{size:22,strokeWidth:2}));
const iconBody=lucide.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
export const markBody='<rect width="28" height="28" rx="2" fill="'+brand.green+'"/><g transform="translate(3 3) scale(0.9166666667)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+iconBody+'</g>';
export const markSVG='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 28 28"><title>SolvencyLoop infinity mark</title>'+markBody+'</svg>';

export async function artworkRenderer(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({deviceScaleFactor:1});
 return {
  async png(source,width,height,file){
   await page.setViewportSize({width,height});
   await page.setContent('<!doctype html><html><head><style>'+fontCSS+'html,body{margin:0;background:transparent}svg{display:block}</style></head><body>'+source+'</body></html>');
   await page.evaluate(async()=>{await document.fonts.load('500 32px "Hanken Grotesk"');await document.fonts.load('600 56px "Hanken Grotesk"');await document.fonts.ready;});
   await page.screenshot({path:file,omitBackground:true,animations:'disabled'});
  },
  async textWidth(value,size,weight=500,spacing=0){
   await page.setContent('<html><head><style>'+fontCSS+'</style></head><body></body></html>');
   return page.evaluate(async({value,size,weight,spacing})=>{
    await document.fonts.load(weight+' '+size+'px "Hanken Grotesk"');
    const context=document.createElement('canvas').getContext('2d');
    context.font=weight+' '+size+'px "Hanken Grotesk"';
    return context.measureText(value).width+Math.max(0,value.length-1)*spacing;
   },{value,size,weight,spacing});
  },
  close:()=>browser.close(),
 };
}
