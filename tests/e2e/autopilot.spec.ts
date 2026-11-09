import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
let bundle:string;
test.beforeAll(async()=>{bundle=(await build({entryPoints:[fileURLToPath(new URL('../fixtures/autopilot-preview.tsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'})).outputFiles[0].text;});
async function open(page:Page,request:APIRequestContext){const html=await(await request.get('/app')).text(),styles=Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g),m=>m[0]).join('');await page.route('**/__autonomy_bundle.js',r=>r.fulfill({contentType:'application/javascript',body:bundle}));await page.route('**/__autonomy_fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+styles+'</head><body><div id="ui-root"></div><script type="module" src="/__autonomy_bundle.js"></script></body></html>'}));await page.goto('/__autonomy_fixture');await expect(page.getByRole('heading',{name:'Agent autopilot',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);}
const next=(p:Page)=>p.getByRole('dialog').getByRole('button',{name:'Continue',exact:true}).click();

test('executor-owner conflict is explained before the setup dialog or any approval',async({page,request})=>{
 await open(page,request);await page.getByLabel('Executor is the owner wallet').check();
 await expect(page.getByRole('alert')).toContainText('separate dedicated executor wallet');
 await expect(page.getByRole('button',{name:'Set up agent allowance',exact:true})).toBeDisabled();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>window.__autopilotResult)).toBeUndefined();
 await page.getByLabel('Show funded allowance').check();
 await expect(page.getByRole('button',{name:'Change policy',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Revoke agent',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Withdraw',exact:true})).toBeEnabled();
});

test('mobile funding and limits stay aligned and reject invalid funding before review',async({page,request})=>{
 await page.setViewportSize({width:360,height:640});await page.emulateMedia({reducedMotion:'reduce'});await open(page,request);
 await page.getByRole('button',{name:'Set up agent allowance',exact:true}).click();const dialog=page.getByRole('dialog');
 const forward=dialog.getByRole('button',{name:'Continue',exact:true}),budget=dialog.getByLabel('Funded budget · USDC');
 await expect(dialog).toContainText('Available to fund');await expect(forward).toBeDisabled();
 await budget.fill('180.000001');await expect(dialog.getByRole('alert')).toContainText('reserve');await expect(forward).toBeDisabled();
 await budget.fill('100.000001');await expect(forward).toBeEnabled();await expect(budget).toBeInViewport();await expect(forward).toBeInViewport();
 const input=await budget.boundingBox(),field=await dialog.locator('.flow-field').boundingBox();expect(input!.width).toBeGreaterThanOrEqual(field!.width-1);
 await page.screenshot({path:'test-results/autopilot-mobile-funding.png',animations:'disabled'});await next(page);
 await dialog.getByLabel('Per transaction · USDC').fill('25');await next(page);await dialog.getByLabel('Rolling 24-hour limit · USDC').fill('24.999999');
 await expect(dialog.getByRole('alert')).toContainText('at least the per-transaction');await expect(forward).toBeDisabled();
 await dialog.getByLabel('Rolling 24-hour limit · USDC').fill('40');await next(page);await dialog.getByLabel('Consent duration · 1–30 days').fill('2');await next(page);
 await dialog.getByLabel(/Casey/).check();await next(page);await dialog.getByLabel('Handle incoming shares from approved counterparties').check();await next(page);
 await expect(dialog.getByRole('button',{name:'Approve with my wallet',exact:true})).toBeInViewport();
 expect(await dialog.evaluate(e=>e.scrollWidth)).toBeLessThanOrEqual(328);
 const consent=dialog.getByLabel(/I authorize this funded scope/);await consent.scrollIntoViewIfNeeded();await expect(consent).toBeInViewport();
 const approve=await dialog.getByRole('button',{name:'Approve with my wallet',exact:true}).boundingBox();expect(approve!.width).toBeGreaterThan(270);expect(approve!.height).toBeLessThanOrEqual(52);
 await page.screenshot({path:'test-results/autopilot-mobile-limits-review.png',animations:'disabled'});
 expect(await page.evaluate(()=>window.__autopilotResult)).toBeUndefined();
});

test('policy edits reuse loaded limits and display the actual submission error inside the dialog',async({page,request})=>{
 await open(page,request);await page.getByLabel('Show funded allowance').check();await page.getByLabel('Reject policy submission').check();await page.getByRole('button',{name:'Change policy',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Per transaction · USDC')).toHaveValue('25');await next(page);await expect(dialog.getByLabel('Rolling 24-hour limit · USDC')).toHaveValue('40');await next(page);
 await dialog.getByLabel('Consent duration · 1–30 days').fill('2');await next(page);await expect(dialog.getByLabel(/Casey/)).toBeChecked();await next(page);await next(page);
 await dialog.getByLabel(/I authorize this funded scope/).check();
 await dialog.getByRole('button',{name:'Approve with my wallet',exact:true}).click();
 await expect(dialog.getByRole('alert')).toHaveText('The rolling 24-hour limit must be at least the per-transaction limit.');
 await expect(dialog).not.toContainText('Read the account message');expect(await page.evaluate(()=>window.__autopilotResult)).toBeUndefined();
});
test('allowance setup starts empty and stages exact limits and consent before a wallet callback',async({page,request})=>{
 await open(page,request);await expect(page.locator('.autopilot-panel .panel').first()).toHaveCSS('opacity','1');await page.screenshot({path:'test-results/autopilot-desktop.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Set up agent allowance',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('input')).toHaveCount(1);await expect(dialog.getByLabel('Funded budget · USDC')).toHaveValue('');
 for(const [label,value] of [['Funded budget · USDC','100.000001'],['Per transaction · USDC','25'],['Rolling 24-hour limit · USDC','40'],['Consent duration · 1–30 days','2']]){await dialog.getByLabel(label,{exact:true}).fill(value);await next(page);}
 await dialog.getByLabel(/Casey/).check();await next(page);await dialog.getByLabel('Handle incoming shares from approved counterparties').check();await dialog.getByLabel('Create bills, capped at the per-transaction amount').check();await next(page);
 await expect(dialog).toContainText('100.000001 USDC');await expect(dialog.getByRole('button',{name:'Approve with my wallet',exact:true})).toBeDisabled();expect(await page.evaluate(()=>window.__autopilotResult)).toBeUndefined();await expect(dialog.locator('.flow-content')).toHaveCSS('opacity','1');await page.screenshot({path:'test-results/autopilot-funding-review.png',animations:'disabled'});
 await dialog.getByLabel(/I authorize this funded scope/).check();await dialog.getByRole('button',{name:'Approve with my wallet',exact:true}).click();expect(await page.evaluate(()=>window.__autopilotResult)).toMatchObject({policy:{budget:'100.000001',perTx:'25',daily:'40',days:2,allowCreate:true,allowIncoming:true}});
});
test('quiet session requires its own explicit scope consent',async({page,request})=>{
 await open(page,request);await page.getByRole('button',{name:'Enable quiet memory',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('temporary browser key');await expect(dialog.getByRole('button',{name:'Authorize once with my wallet',exact:true})).toBeDisabled();expect(await page.evaluate(()=>window.__autopilotResult)).toBeUndefined();await dialog.getByLabel(/I allow scoped memory requests/).check();await dialog.getByRole('button',{name:'Authorize once with my wallet',exact:true}).click();expect(await page.evaluate(()=>window.__autopilotResult)).toBe('session-authorized');
});
test('public sharing is opt-in and discloses permanent public history',async({page,request})=>{
 await open(page,request);await page.getByRole('button',{name:'Share my preferences',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('radio',{checked:true})).toHaveCount(0);await dialog.getByRole('radio',{name:'Yes',exact:true}).check();await next(page);const vegetarian=dialog.getByRole('group',{name:'Vegetarian preference',exact:true});await expect(vegetarian).toBeVisible();await vegetarian.getByRole('radio',{name:'Yes',exact:true}).check();await next(page);await expect(dialog).toContainText('public on Sui');await expect(dialog.getByRole('button',{name:'Approve with my wallet',exact:true})).toBeDisabled();await dialog.getByLabel(/I consent to publishing/).check();await dialog.getByRole('button',{name:'Approve with my wallet',exact:true}).click();expect(await page.evaluate(()=>window.__autopilotResult)).toEqual({public:{excludeAlcohol:true,vegetarian:true}});
});
test('group conventions collect real members and exact percentages before publication',async({page,request})=>{
 await open(page,request);await page.getByRole('button',{name:'Create a group convention',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Convention name',{exact:true}).fill('Fixture utilities');await next(page);await dialog.getByLabel('Casey',{exact:true}).check();await next(page);await dialog.getByLabel('Casey · percentage',{exact:true}).fill('60');await next(page);await dialog.getByLabel('You · percentage',{exact:true}).fill('40');await next(page);await expect(dialog).toContainText('Every member must approve');expect(await page.evaluate(()=>window.__autopilotResult)).toBeUndefined();await dialog.getByRole('button',{name:'Approve with my wallet',exact:true}).click();expect(await page.evaluate(()=>window.__autopilotResult)).toMatchObject({group:{title:'Fixture utilities',members:[{weight:6000},{weight:4000}]}});
});
test('owner revocation remains reachable during a routine request and mobile review fits',async({page,request})=>{
 await page.setViewportSize({width:360,height:800});await open(page,request);await page.getByLabel('Show funded allowance').check();await page.getByLabel('Routine agent request is busy').check();await expect(page.getByRole('button',{name:'Top up',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Revoke agent',exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await page.screenshot({path:'test-results/autopilot-mobile.png',fullPage:true});await page.getByRole('button',{name:'Revoke agent',exact:true}).click();await expect(page.getByRole('button',{name:'Approve with my wallet',exact:true})).toBeInViewport();await page.getByRole('button',{name:'Approve with my wallet',exact:true}).click();expect(await page.evaluate(()=>window.__autopilotResult)).toMatchObject({action:'revoke'});
});
