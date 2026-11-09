import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
let bundle:string;
test.beforeAll(async()=>{bundle=(await build({entryPoints:[fileURLToPath(new URL('../fixtures/entry-preview.tsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'})).outputFiles[0].text;});
async function open(page:Page,request:APIRequestContext){
 const html=await(await request.get('/app')).text(),styles=Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g),m=>m[0]).join('');
 await page.route('**/__entry_bundle.js',r=>r.fulfill({contentType:'application/javascript',body:bundle}));
 await page.route('**/__entry_fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+styles+'</head><body><div id="ui-root"></div><script type="module" src="/__entry_bundle.js"></script></body></html>'}));
 await page.goto('/__entry_fixture');await expect(page.getByRole('heading',{name:'Set up your account.',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.getByText('Isolated entry fixture controls',{exact:true}).click();
}
async function view(page:Page,name:string){await page.getByRole('button',{name,exact:true}).click();}

test('Quiet Memory sign-in stays focused and owner recovery is available inside the proof drawer',async({page,request})=>{
 await open(page,request);await view(page,'Quiet sign-in');
 await expect(page.getByRole('heading',{name:'Sign in with Quiet Memory',exact:true})).toBeVisible();
 await expect(page.locator('.autopilot-panel:visible')).toHaveCount(0);await expect(page.getByRole('button',{name:'Revoke agent',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/quiet-memory-sign-in.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Open account and proof',exact:true}).click();await page.getByText('Recover agent funds',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Revoke agent',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Withdraw',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Close account details',exact:true}).click();await expect(page.locator('.autopilot-panel:visible')).toHaveCount(0);
 await page.getByRole('button',{name:'Authorize this session',exact:true}).click();expect(await page.evaluate(()=>window.__entryAction)).toBe('quiet-sign-in');
});

test('real wallet entry and portalled connection modal share the workspace visual identity',async({page})=>{
 const errors:string[]=[],chain:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/(memory|agent|tatum-rpc)/.test(r.url()))chain.push(r.url());});
 await page.goto('/app');await expect(page.getByRole('heading',{name:'Start with your Sui wallet',exact:true})).toBeVisible();await expect(page.locator('.loading-state')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
 const connect=page.getByRole('button',{name:'Connect Wallet',exact:true});await expect(connect).toHaveCSS('background-color','rgb(28, 27, 27)');await expect(connect).toHaveCSS('font-family',/Hanken Grotesk/);
 await page.screenshot({path:'test-results/entry-desktop.png',fullPage:true,animations:'disabled'});await connect.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:'Connect a Wallet'})).toHaveCSS('font-family',/Hanken Grotesk/);await page.screenshot({path:'test-results/wallet-connect-desktop.png',animations:'disabled'});
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(connect).toBeFocused();expect(chain).toEqual([]);expect(errors).toEqual([]);
 await page.setViewportSize({width:360,height:800});await page.screenshot({path:'test-results/entry-mobile.png',fullPage:true,animations:'disabled'});await connect.click();await expect(dialog).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);const bounds=await dialog.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(800);await page.screenshot({path:'test-results/wallet-connect-mobile.png',animations:'disabled'});
});

test('onboarding restyle keeps account-wide consent, actual references and disabled states intact',async({page,request})=>{
 await open(page,request);await view(page,'Create account');await expect(page.getByRole('list',{name:'Account setup progress'}).locator('[aria-current=step]')).toContainText('Memory account');await expect(page.getByRole('button',{name:'Create my memory account'})).toBeEnabled();
 await view(page,'Permission');await expect(page.getByText(/including memories from other apps/)).toBeVisible();const authorize=page.getByRole('button',{name:'Authorize memory access',exact:true});await expect(authorize).toBeDisabled();await page.getByLabel(/I understand and allow/).check();await expect(authorize).toBeEnabled();await page.getByLabel('Disable account actions').check();await expect(authorize).toBeDisabled();await page.getByLabel('Disable account actions').uncheck();await page.screenshot({path:'test-results/onboarding-permission-desktop.png',fullPage:true,animations:'disabled'});await authorize.click();expect(await page.evaluate(()=>window.__entryAction)).toBe('authorize');
 await page.getByText('Account & app key details',{exact:true}).click();await expect(page.locator('.proof-address').first()).toContainText('0x'+'2'.padStart(64,'0'));
 await view(page,'Profile');await page.getByRole('button',{name:'Create my profile',exact:true}).click();await expect(page.getByLabel('Display name',{exact:true})).toHaveValue('');await page.screenshot({path:'test-results/onboarding-profile-dialog.png',animations:'disabled'});await page.keyboard.press('Escape');await view(page,'Authorized');await expect(page.getByText('Access authorized',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Revoke app memory access'})).toBeEnabled();
 await view(page,'Frozen');await expect(page.getByText('Frozen',{exact:true}).last()).toBeVisible();await expect(authorize).toBeDisabled();await view(page,'Recovery');await expect(page.getByRole('heading',{name:'Recover existing USDC'})).toBeVisible();
});

test('mobile onboarding and route loaders retain readable layout and reduced-motion behavior',async({page,request})=>{
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await open(page,request);
 await expect(page.locator('.loading-state')).toHaveAttribute('data-motion','false');await expect(page.locator('.loading-skeleton>span').first()).toHaveCSS('animation-name','none');await expect(page.getByRole('status')).not.toContainText(/\d+%/);expect((await page.locator('.loading-skeleton').boundingBox())!.width).toBeGreaterThan(240);expect((await page.locator('.loading-skeleton>span').first().boundingBox())!.width).toBeGreaterThan(100);await page.screenshot({path:'test-results/onboarding-loading-mobile.png',fullPage:true,animations:'disabled'});
 for(const name of ['Create account','Permission','Authorized','Frozen','Profile','Recovery']){await view(page,name);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);}
 await view(page,'Permission');await page.screenshot({path:'test-results/onboarding-permission-mobile.png',fullPage:true,animations:'disabled'});await view(page,'Route loading');await expect(page.getByRole('status')).toContainText('Opening your workspace');await expect(page.locator('.route-loading')).toHaveCSS('background-color','rgb(252, 249, 248)');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await page.screenshot({path:'test-results/route-loading-mobile.png',fullPage:true,animations:'disabled'});
});
