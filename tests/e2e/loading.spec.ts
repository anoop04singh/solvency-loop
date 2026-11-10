import {test,expect,type Page,type APIRequestContext,type Route} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
let bundle:string;
test.beforeAll(async()=>{bundle=(await build({entryPoints:[fileURLToPath(new URL('../fixtures/loading-preview.tsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'})).outputFiles[0].text;});
async function open(page:Page,request:APIRequestContext,dialog=false){
 const html=await(await request.get('/app')).text(),styles=Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g),m=>m[0]).join('');
 await page.route('**/__loading_bundle.js',r=>r.fulfill({contentType:'application/javascript',body:bundle}));
 await page.route('**/__loading_fixture*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+styles+'</head><body><div id="ui-root"></div><script type="module" src="/__loading_bundle.js"></script></body></html>'}));
 await page.goto('/__loading_fixture'+(dialog?'?dialog=1':''));await page.evaluate(()=>document.fonts.ready);
}
test('sign-in shows real phase progress, elapsed waits and paged proof counts before opening the workspace',async({page,request})=>{
 await page.clock.install();let social:Route|undefined,lastPage:Route|undefined;const phases:string[]=[];
 const reply=(route:Route,extra:object)=>{const p=route.request().postDataJSON().payload;return route.fulfill({json:{readPhase:p.readPhase,memoryAccountId:p.walletAddress,tatumAnchor:{checkpoint:'123'},...extra}});};
 await page.route('**/api/memory',async route=>{
  const p=route.request().postDataJSON().payload;phases.push(p.readPhase);expect(p.action).toBe('recall_all');expect(p.autoExecute).toBeUndefined();
  if(p.readPhase==='personal')await route.fulfill({contentType:'application/x-ndjson',body:[
   {type:'progress',progress:{stage:'account',state:'complete',at:Date.now(),checkpoint:'123'}},
   {type:'result',data:{readPhase:p.readPhase,memoryAccountId:p.walletAddress,tatumAnchor:{checkpoint:'123'},memories:[{blob_id:'test-only',namespace:'fixture',category:'habit_regret',text:'Fixture fact'}]}},
  ].map(frame=>JSON.stringify(frame)+'\n').join('')});
  else if(p.readPhase==='social')social=route;
  else if(p.evidenceOffset===0)await reply(route,{verifiedSettlements:Array.from({length:5},()=>({digest:'fixture-only'})),rejectedEvidenceCount:0,evidenceSnapshot:'a'.repeat(64),nextEvidenceOffset:5});
  else lastPage=route;
 });
 await open(page,request);await page.getByRole('button',{name:'Start sign-in fixture'}).click();
 await expect.poll(()=>!!social).toBe(true);
 const activity=page.getByRole('region',{name:'Preparing your workspace'}),steps=page.getByRole('list',{name:'Request progress'});
 await expect(steps.locator('[data-state=complete]')).toContainText(['Authorizing access','Checking your account','Loading your memories']);
 await expect(steps.locator('[data-state=waiting]')).toContainText(['Verifying payment history','Preparing your dashboard']);
 await expect(activity).toHaveAttribute('aria-busy','true');await expect(page.getByText('Workspace ready',{exact:true})).toHaveCount(0);
 await page.clock.fastForward(23_000);await expect(activity).toContainText('23s elapsed');await expect(activity).toContainText('Still working on the current step');await expect(activity).not.toContainText(/\d+%/);
 await page.getByText('Verifying payment history',{exact:true}).click();await expect(page.getByText(/Every page must finish/)).toBeVisible();
 await page.screenshot({path:'test-results/loading-sign-in-desktop.png',fullPage:true,animations:'disabled'});
 await reply(social!,{memories:[],verifiedSettlements:[],publicPreferences:[],groups:[]});await expect.poll(()=>!!lastPage).toBe(true);
 await expect(steps.locator('[data-state=active]')).toContainText('5 payment proofs checked so far');await expect(page.getByText('Workspace ready',{exact:true})).toHaveCount(0);
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await expect(activity).toHaveAttribute('data-motion','false');await expect(activity.locator('.workspace-activity-orbit')).toHaveCSS('animation-name','none');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
 await page.screenshot({path:'test-results/loading-sign-in-mobile.png',fullPage:true,animations:'disabled'});
 await lastPage!.fulfill({status:502,json:{error:'Fixture evidence unavailable',noFinancialExecution:true}});
 await expect(page.getByRole('region',{name:'Personal insights could not load'})).toHaveAttribute('aria-busy','false');await expect(page.getByText('Loading paused',{exact:true})).toBeVisible();await expect(steps.locator('[data-state=paused]')).toContainText('Needs attention');await expect(page.getByText('Workspace ready',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Retry sign-in'})).toBeEnabled();
 await page.screenshot({path:'test-results/loading-sign-in-paused.png',fullPage:true,animations:'disabled'});expect(phases).toEqual(['personal','social','evidence','evidence']);
});

test('mobile step dialogs show the current work above their disabled inputs',async({page,request})=>{
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});let pending:Route|undefined;
 await page.route('**/api/memory',async route=>{
  const p=route.request().postDataJSON().payload;
  if(p.readPhase==='personal')await route.fulfill({json:{readPhase:'personal',memoryAccountId:p.walletAddress,tatumAnchor:{checkpoint:'123'},memories:[]}});
  else pending=route;
 });
 await open(page,request,true);await page.getByRole('button',{name:'Start sign-in fixture'}).click();await expect.poll(()=>!!pending).toBe(true);
 const dialog=page.getByRole('dialog'),activity=dialog.locator('.workspace-activity');
 await expect(activity).toBeVisible();await expect(activity.getByRole('status')).toContainText('Checking shared context');await expect(dialog.getByRole('button',{name:'Please wait…'})).toBeDisabled();await expect(dialog.getByRole('textbox',{name:'Fixture detail'})).toBeDisabled();await expect(activity).toHaveAttribute('data-motion','false');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);const bounds=await dialog.boundingBox();expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(800);
 await page.screenshot({path:'test-results/loading-dialog-mobile.png',animations:'disabled'});await pending!.abort();
});
