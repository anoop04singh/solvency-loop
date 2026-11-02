import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
let bundle:string;
test.beforeAll(async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../fixtures/ui-preview.tsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});
 bundle=result.outputFiles[0].text;
});
async function openForms(page:Page,request:APIRequestContext){
 const html=await (await request.get('/app')).text(),styles=Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g),m=>m[0]).join('');
 expect(styles).not.toBe('');
 await page.route('**/__ui_preview_bundle.js',route=>route.fulfill({contentType:'application/javascript',body:bundle}));
 await page.route('**/__ui_preview',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+styles+'</head><body><div id="ui-root"></div><script type="module" src="/__ui_preview_bundle.js"></script></body></html>'}));
 await page.goto('/__ui_preview');await expect(page.getByRole('heading',{name:'Split a bill',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
const next=(page:Page)=>page.getByRole('dialog').getByRole('button',{name:'Continue',exact:true}).click();
async function person(page:Page,name='Casey'){
 const contact=page.getByRole('combobox',{name:'Add a saved contact'});
 await contact.fill(name);await contact.press('ArrowDown');await contact.press('Enter');
 await expect(page.locator('.review-person').filter({hasText:name})).toBeVisible();
}
async function startBill(page:Page,total='60.000001'){
 await page.getByRole('button',{name:'Create an expense',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog').locator('input:not([type=radio]):not([type=checkbox])')).toHaveCount(1);
 await page.getByLabel('Expense name',{exact:true}).fill('Fixture bill');await next(page);
 await page.getByLabel('Total bill · USDC',{exact:true}).fill(total);await next(page);await page.getByRole('radio',{name:'Equally, including me',exact:true}).check();
}
test('guided equal split requires explicit contact choice, fresh recall and final review',async({page,request})=>{
 await openForms(page,request);await startBill(page);await next(page);
 const contact=page.getByRole('combobox',{name:'Add a saved contact'});await contact.fill('cas');
 await expect(page.getByRole('option')).toHaveCount(1);expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await contact.press('ArrowDown');await contact.press('Enter');
 await next(page);await expect(page.getByRole('heading',{name:'Does anyone need an upfront deposit?'})).toBeVisible();await next(page);
 await page.getByRole('button',{name:'Recall & review'}).click();
 await expect(page.locator('.share-line').filter({hasText:'Casey'})).toContainText('30.00 USDC');
 await expect(page.locator('.share-line').filter({hasText:'You'})).toContainText('30.000001 USDC');
 expect(await page.evaluate(()=>window.__recalls)).toBe(1);expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.screenshot({path:'test-results/desktop-split-review.png',fullPage:true});
 await page.getByRole('button',{name:'Create expense',exact:true}).click();
 expect(await page.evaluate(()=>window.__formResult)).toMatchObject({title:'Fixture bill',totalAmountUsdc:60.000001,shares:[{debtorAddress:'0x'+'2'.padStart(64,'0'),amountUsdc:30,requiresUpfrontEscrow:false}]});
});
test('receipt wizard shows recalled alcohol exclusion and keeps exact amounts for approval',async({page,request})=>{
 await openForms(page,request);await startBill(page,'16.50');
 await page.getByRole('radio',{name:/By receipt items/}).check();await next(page);await person(page);await next(page);
 await page.getByRole('radio',{name:'Food',exact:true}).check();await next(page);await page.getByLabel('Item amount · USDC').fill('11.50');await next(page);await next(page);
 await page.getByRole('button',{name:'Add another item'}).click();
 await page.getByRole('radio',{name:'Alcohol / drinks'}).check();await next(page);
 await page.getByLabel('Item amount · USDC').fill('5');await next(page);await next(page);
 await page.getByRole('button',{name:'Receipt complete'}).click();await next(page);
 await page.getByRole('button',{name:'Recall & review'}).click();
 await expect(page.locator('.share-line').filter({hasText:'Casey'})).toContainText('5.75 USDC');
 await expect(page.getByText('Excluded: Drinks 2')).toBeVisible();
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Create expense',exact:true}).click();
 expect(await page.evaluate(()=>window.__formResult)).toMatchObject({totalAmountUsdc:16.5,shares:[{amountUsdc:5.75}]});
});
test('recall failure remains on the choice step and cannot silently create a standard bill',async({page,request})=>{
 await openForms(page,request);await page.getByLabel('Fail memory recall').check();
 await startBill(page);await next(page);await person(page);await next(page);await next(page);
 await page.getByRole('button',{name:'Recall & review'}).click();
 await expect(page.getByRole('alert')).toContainText('Fixture recall unavailable');
 await expect(page.getByRole('heading',{name:'Refresh learning before review?'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create expense',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('editing a preference contact clears selection and reviewed choices are saved together',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Memory',exact:true}).click();await page.getByRole('button',{name:'Set a preference'}).click();
 const contact=page.getByRole('combobox',{name:'Contact',exact:true});
 await contact.fill('Casey');await contact.press('ArrowDown');await contact.press('Enter');await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
 await contact.fill('Jordan');await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
 await contact.press('ArrowDown');await contact.press('Enter');await next(page);
 await page.getByRole('radio',{name:/Exclude from alcohol/}).check();await next(page);await page.getByRole('radio',{name:/Use verified payment history/}).check();await next(page);
 await page.getByLabel('Share threshold · USDC').fill('40');await next(page);
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Save to my memory'}).click();
 expect(await page.evaluate(()=>window.__formResult)).toEqual({wallet:'0x'+'3'.padStart(64,'0'),threshold:40,excludeAlcohol:true,fundingPolicy:'adaptive'});
});
test('48-hour check-in uses options and intensity scale, and recent purchases remain unavailable',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Regret',exact:true}).click();
 const recent=page.locator('.purchase-row').filter({hasText:'Fixture recent purchase'});await expect(recent.getByRole('button',{name:'Regretted',exact:true})).toBeDisabled();
 const due=page.locator('.purchase-row').filter({hasText:'Fixture merchant 2'});await due.getByRole('button',{name:'Regretted',exact:true}).click();
 await page.getByRole('slider',{name:'Regret intensity'}).fill('5');await next(page);
 await expect(page.getByText('Regretted · 5/5',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Save to my memory'}).click();
 expect(await page.evaluate(()=>window.__formResult)).toMatchObject({action:'regret_checkin',purchaseId:'fixture-purchase-0002',verdict:'regretted',intensity:5});
});
test('purchase entry reuses real merchant suggestions and waits for a reviewed signed write',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Regret',exact:true}).click();await page.getByRole('button',{name:'Add a purchase'}).click();
 const category=page.getByRole('combobox',{name:'Purchase category'});await category.fill('Work');await category.press('ArrowDown');await category.press('Enter');await next(page);
 const merchant=page.getByRole('combobox',{name:'Merchant or place'});await merchant.fill('Fixture merchant 2');await merchant.press('ArrowDown');await merchant.press('Enter');await next(page);
 await page.getByLabel('Amount · USDC',{exact:true}).fill('30.000001');await next(page);
 await page.getByRole('radio',{name:'48 hours ago',exact:true}).check();await next(page);
 await expect(page.getByRole('heading',{name:'Save this purchase for a check-in?'})).toBeVisible();expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Save to my memory'}).click();
 expect(await page.evaluate(()=>window.__formResult)).toMatchObject({action:'record_purchase',merchantCategory:'workspace',merchant:'Fixture merchant 2',amountUsdc:'30.000001',purchasedAtMs:Date.UTC(2026,9,29,23)});
});
test('profile and vault dialogs send a reviewed draft and only lock after final approval',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Edit profile & reserve'}).click();
 await page.getByLabel('Display name',{exact:true}).fill('My profile');await next(page);
 await page.getByLabel('Keep available · USDC').fill('23.456789');await next(page);
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();await page.getByRole('button',{name:'Save with my wallet'}).click();
 expect(await page.evaluate(()=>window.__formResult)).toEqual({handle:'My profile',floor:23.456789,friends:[]});
 await page.getByRole('button',{name:'Savings',exact:true}).click();await expect(page.locator('.vault-amount')).toContainText('100.00');
 await page.getByRole('button',{name:'Protect some USDC'}).click();await page.getByLabel('Amount · USDC',{exact:true}).fill('10.000001');
 await page.getByRole('button',{name:'Review protection'}).click();expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Lock USDC for 24 hours'}).click();
 expect(await page.evaluate(()=>window.__formResult)).toEqual({amount:10.000001});
});
test('dialogs fit mobile, trap focus, support Back and Escape and return focus to launcher',async({page,request})=>{
 await page.setViewportSize({width:360,height:800});await openForms(page,request);
 const launcher=page.getByRole('button',{name:'Create an expense',exact:true});await startBill(page);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByLabel('Total bill · USDC',{exact:true})).toHaveValue('60.000001');
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('dialog'))).toBe(true);}
 await page.screenshot({path:'test-results/mobile-guided-form.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(launcher).toBeFocused();
 for(const view of ['Expenses','Regret','Memory','Profile','Savings','Permissions']){
  await page.getByRole('button',{name:view,exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
 }
 await page.getByLabel('Disable form').check();await page.getByRole('button',{name:'Expenses',exact:true}).click();await expect(launcher).toBeDisabled();
});
test('memory access still requires explicit account-wide consent',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Permissions',exact:true}).click();
 await expect(page.getByText(/including memories from other apps/)).toBeVisible();
 const authorize=page.getByRole('button',{name:'Authorize memory access',exact:true});await expect(authorize).toBeDisabled();
 await page.getByRole('checkbox',{name:/I understand and allow/}).check();await expect(authorize).toBeEnabled();
 await page.getByLabel('Disable form').check();await expect(authorize).toBeDisabled();
 await page.getByLabel('Disable form').uncheck();await authorize.click();expect(await page.evaluate(()=>window.__formResult)).toBe('delegate-authorize');
});
test('the workspace follows the three-tab and five-tier hierarchy with reviewed row actions',async({page,request})=>{
 await openForms(page,request);
 const navigation=page.getByRole('navigation',{name:'Workspace',exact:true}),tabs=navigation.getByRole('tab');
 await expect(tabs).toHaveCount(3);await expect(tabs.nth(0)).toHaveText('Split a Bill');await expect(tabs.nth(1)).toContainText('Regret Check-In');await expect(tabs.nth(2)).toContainText('Settle Shares');
 await expect(page.locator('.split-workspace .primary-commit')).toHaveCount(1);
 const workspaceBox=await page.locator('.workspace-stage').boundingBox(),headerBox=await page.locator('.editorial-header-inner').boundingBox();
 expect(workspaceBox!.width).toBeLessThanOrEqual(672);expect(headerBox!.width).toBeLessThanOrEqual(896);
 await tabs.nth(0).focus();await page.keyboard.press('ArrowRight');await expect(tabs.nth(1)).toBeFocused();await expect(tabs.nth(1)).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.regret-panel .primary-commit')).toHaveCount(1);await expect(page.locator('.regret-panel .primary-commit')).toContainText('30.00 USDC');
 const due=page.locator('.purchase-row').filter({hasText:'Fixture merchant 2'});
 await expect(due.getByRole('button',{name:'Regretted',exact:true})).toHaveClass(/button-outline/);await expect(due.getByRole('button',{name:'Worth It',exact:true})).toHaveClass(/button-compact/);
 await due.getByRole('button',{name:'Worth It',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Save your check-in?');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();await page.keyboard.press('Escape');
 await tabs.nth(2).click();const pay=page.getByRole('button',{name:'Pay Share',exact:true}).first();await expect(pay).toHaveClass(/button-compact/);
 await page.locator('.panel').first().evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
 await page.screenshot({path:'test-results/hierarchy-settlement.png',fullPage:true});
 await pay.click();await expect(page.getByRole('dialog')).toContainText('15.00 USDC');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Continue to wallet'}).click();expect(await page.evaluate(()=>window.__formResult)).toEqual({amount:15,upfront:false});
 await expect(page.locator('.telemetry-status')).toContainText('Tatum Checkpoint #123');
 await page.getByRole('button',{name:'Open account and proof'}).click();await page.getByText('Workspace tools',{exact:true}).click();await page.getByRole('button',{name:'Vaults & protection',exact:false}).click();await expect(page.getByRole('heading',{name:'24-hour protection',exact:true})).toBeVisible();
 await page.locator('.panel').first().evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
 await page.screenshot({path:'test-results/hierarchy-desktop.png',fullPage:true});
 await page.setViewportSize({width:360,height:800});await page.getByRole('button',{name:'SolvencyLoop workspace'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
 const centers=await page.locator('.editorial-header-inner').evaluate(element=>Array.from(element.children).map(child=>{const box=child.getBoundingClientRect();return box.top+box.height/2;}));
 expect(Math.max(...centers)-Math.min(...centers)).toBeLessThanOrEqual(2);
 await page.locator('.panel').first().evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
 await page.screenshot({path:'test-results/hierarchy-mobile.png',fullPage:true});
});
test('payment preparation errors remain visible inside review and do not claim wallet approval',async({page,request})=>{
 await openForms(page,request);await page.getByLabel('Fail payment preparation').check();await page.getByRole('tab',{name:/Settle Shares/}).click();
 await page.getByRole('button',{name:'Pay Share',exact:true}).first().click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('Your wallet opens after live account, coin and transaction checks succeed.');
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();await dialog.getByRole('button',{name:'Continue to wallet'}).click();
 await expect(dialog.getByRole('alert')).toContainText('Fixture provider coin read failed');
 expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();await expect(dialog.getByRole('button',{name:'Continue to wallet'})).toBeEnabled();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});
test('Auto-Split fills the editorial bill workspace, uses fresh learning and keeps a draft across tabs',async({page,request})=>{
 await openForms(page,request);await page.getByLabel('Smart Fill bill description').fill('Paid $16.50 at Corner Cafe ($11.50 food, $5 drinks) with Casey, Jordan');
 await page.getByRole('button',{name:'Auto-Split',exact:true}).click();await expect(page.getByRole('heading',{name:'Corner Cafe',exact:true})).toBeVisible();
 await expect(page.locator('.allocation-person').filter({hasText:'Casey'})).toContainText('$3.833333');
 await expect(page.locator('.category-boxes:visible')).toContainText('Casey excluded');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await expect(page.getByRole('button',{name:'Entered choices',exact:true})).toHaveCount(0);await expect(page.locator('.spending-number')).toContainText('$60.00');expect(await page.evaluate(()=>window.__recalls)).toBe(1);
 await page.getByRole('tab',{name:/Regret Check-In/}).click();await page.getByRole('tab',{name:'Split a Bill',exact:true}).click();await expect(page.getByRole('heading',{name:'Corner Cafe',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create Split on Sui Mainnet',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Does everyone’s share look right?');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('dialog').getByRole('button',{name:'Create expense',exact:true}).click();expect(await page.evaluate(()=>window.__formResult)).toMatchObject({title:'Corner Cafe',totalAmountUsdc:16.5,shares:[{amountUsdc:3.833333},{amountUsdc:6.333333}]});
});
test('drawer contact edits stay staged until a reviewed on-chain save and nested dialogs restore scroll correctly',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Open account and proof'}).click();
 await expect(page.getByRole('heading',{name:'On-Chain Setup & Walrus Memory',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add contact',exact:true}).click();const editor=page.locator('.flow-dialog[open]');
 await editor.getByLabel('Contact name',{exact:true}).fill('Taylor');await editor.getByRole('button',{name:'Continue',exact:true}).click();
 await editor.getByLabel('Sui wallet',{exact:true}).fill('0x'+'4'.padStart(64,'0'));await editor.getByRole('button',{name:'Continue',exact:true}).click();
 await editor.getByRole('button',{name:'Apply to contacts'}).click();await expect(page.locator('.drawer-contact-list')).toContainText('Taylor');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 await page.getByRole('button',{name:'Save Contacts On-Chain',exact:true}).click();await expect(editor).toContainText('Save these contacts on Sui?');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await editor.getByRole('button',{name:'Save with my wallet'}).click();await expect(page.locator('.drawer-section-heading').first()).toContainText('3 Registered Peers');
 expect(await page.evaluate(()=>window.__formResult)).toMatchObject({savedContacts:[{handle:'Casey'},{handle:'Jordan'},{handle:'Taylor'}]});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
});
test('settle-my-shares reviews only owned pending shares and respects an edited batch selection',async({page,request})=>{
 await openForms(page,request);await page.getByRole('tab',{name:/Settle Shares/}).click();await expect(page.getByRole('button',{name:'Switch wallet',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:/Settle My 2 Pending Shares/}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.locator('.batch-choices label')).toHaveCount(2);await expect(dialog.locator('.batch-total')).toContainText('25.00 USDC');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await dialog.getByRole('checkbox',{name:/Fixture second bill/}).uncheck();await expect(dialog.locator('.batch-total')).toContainText('15.00 USDC');
 await dialog.getByRole('button',{name:'Continue to wallet'}).click();expect(await page.evaluate(()=>window.__formResult)).toEqual({batch:['0x'+'9'.padStart(64,'0')]});
});
test('the reference check-in vault action opens the actual amount and cooldown review before confirmation',async({page,request})=>{
 await openForms(page,request);await page.getByRole('tab',{name:/Regret Check-In/}).click();await page.getByRole('button',{name:/Protect.*30.00 USDC in 24h Vault/}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Amount · USDC',{exact:true})).toHaveValue('30');await dialog.getByRole('button',{name:'Review protection'}).click();await expect(dialog).toContainText('24 hours after the confirmed transaction');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await dialog.getByRole('button',{name:'Lock USDC for 24 hours'}).click();expect(await page.evaluate(()=>window.__formResult)).toEqual({amount:30});
});

test('tactile receipt fields start empty and use the same fresh learning and exact review as Smart Fill',async({page,request})=>{
 await openForms(page,request);await expect(page.getByLabel('Food amount · USDC',{exact:true})).toHaveValue('');await expect(page.getByLabel('Drinks amount · USDC',{exact:true})).toHaveValue('');
 await page.getByLabel('Food amount · USDC',{exact:true}).fill('11.50');await page.getByLabel('Drinks amount · USDC',{exact:true}).fill('5');
 await page.getByRole('button',{name:'Create an expense',exact:true}).click();await page.getByLabel('Expense name',{exact:true}).fill('My entered receipt');await next(page);
 await expect(page.getByRole('dialog')).toContainText('Food and drinks total: 16.5 USDC');await next(page);await person(page);await person(page,'Jordan');await next(page);
 await page.getByRole('button',{name:'Receipt complete'}).click();await next(page);await page.getByRole('button',{name:'Recall & review'}).click();
 await expect(page.locator('.share-line').filter({hasText:'Casey'})).toContainText('3.833333 USDC');expect(await page.evaluate(()=>window.__formResult)).toBeUndefined();
 await page.getByRole('button',{name:'Create expense',exact:true}).click();expect(await page.evaluate(()=>window.__formResult)).toMatchObject({title:'My entered receipt',totalAmountUsdc:16.5,shares:[{amountUsdc:3.833333},{amountUsdc:6.333333}]});
});

test('new bill, purchase and preference choices have no preset financial inputs',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Create an expense',exact:true}).click();await expect(page.getByLabel('Expense name',{exact:true})).toHaveValue('');await page.getByLabel('Expense name',{exact:true}).fill('My bill');await next(page);await expect(page.getByLabel('Total bill · USDC',{exact:true})).toHaveValue('');await page.getByLabel('Total bill · USDC',{exact:true}).fill('10');await next(page);await expect(page.locator('dialog input[type=radio]:checked')).toHaveCount(0);await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Memory',exact:true}).click();await page.getByRole('button',{name:'Set a preference',exact:true}).click();await expect(page.getByRole('combobox',{name:'Contact',exact:true})).toHaveValue('');await page.getByRole('button',{name:'Close payment preference',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Regret',exact:true}).click();await page.getByRole('button',{name:'Add a purchase',exact:true}).click();await expect(page.getByRole('combobox',{name:'Purchase category',exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
});

test('session learning waits for owned onboarding, loads once per wallet and retries errors only on request',async({page,request})=>{
 await openForms(page,request);await page.getByRole('button',{name:'Session',exact:true}).click();const session=page.locator('.session-fixture'),count=session.getByLabel('Session refresh count');
 await expect(count).toHaveText('0');await expect(session.locator('.spending-number')).toContainText('—');
 await session.getByRole('checkbox',{name:'Owned profile and memory authorized'}).check();await expect(count).toHaveText('1');await expect(session.locator('.spending-number')).toContainText('—');
 await session.getByRole('button',{name:'Finish learning read'}).click();await expect(session.locator('.spending-number')).toContainText('$60.00');
 await session.getByRole('checkbox',{name:'Block session requests'}).check();await session.getByRole('checkbox',{name:'Block session requests'}).uncheck();await expect(count).toHaveText('1');
 await session.getByRole('checkbox',{name:'Fail session learning'}).check();await session.getByRole('combobox',{name:'Session wallet'}).selectOption('0x'+'2'.padStart(64,'0'));await session.getByRole('checkbox',{name:'Owned profile and memory authorized'}).check();await expect(count).toHaveText('2');
 await session.getByRole('button',{name:'Finish learning read'}).click();await expect(session.locator('p[role=status]')).toHaveText('error');await expect(session.locator('.spending-number')).toContainText('—');await expect(count).toHaveText('2');
 await session.getByRole('checkbox',{name:'Fail session learning'}).uncheck();await session.getByRole('button',{name:'Retry personal learning'}).click();await expect(count).toHaveText('3');await session.getByRole('button',{name:'Finish learning read'}).click();await expect(session.locator('.spending-number')).toContainText('$60.00');
});
test('all supplied screen compositions render with the reference font and fit mobile without fabricated claims',async({page,request})=>{
 await openForms(page,request);await page.setViewportSize({width:1280,height:1200});
 await page.locator('.fixture-tools,.workspace-stage > .checkbox-row,.workspace-stage > .eyebrow').evaluateAll(els=>els.forEach(e=>e.setAttribute('hidden','')));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/lifecycle-empty-desktop.png',fullPage:true});
 await page.getByLabel('Smart Fill bill description').fill('Paid 16.50 at Corner Cafe (11.50 food, 5 drinks) with Casey, Jordan');await page.getByRole('button',{name:'Auto-Split',exact:true}).click();await expect(page.getByRole('heading',{name:'Corner Cafe'})).toBeVisible();
 await page.locator('.fixture-tools').evaluate(element=>element.setAttribute('hidden',''));
 await page.locator('.workspace-stage > .checkbox-row').evaluateAll(elements=>elements.forEach(e=>e.setAttribute('hidden','')));
 await page.locator('.workspace-stage > .eyebrow').evaluate(element=>element.setAttribute('hidden',''));
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.locator('.split-workspace').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
 await page.screenshot({path:'test-results/reference-split.png',fullPage:true});
 await page.getByRole('tab',{name:/Regret Check-In/}).click();await page.locator('.panel').filter({hasText:'48-Hour Quick Check-In'}).evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:'test-results/reference-regret.png',fullPage:true});
 await page.getByRole('tab',{name:/Settle Shares/}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.settlement-panel').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:'test-results/reference-settlement.png',fullPage:true});await page.getByRole('button',{name:'Proof Drawer',exact:true}).click();await page.locator('.proof-drawer').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});expect((await page.locator('.proof-drawer').boundingBox())!.x).toBe(832);await page.screenshot({path:'test-results/reference-proof.png'});
 expect(await page.evaluate(()=>document.fonts.check('15px "Hanken Grotesk"'))).toBe(true);await expect(page.getByText(/Predicted Regret|Calibrated|Seed 12|Zero Gas Unfreeze|ZK-STATE PROOFS/)).toHaveCount(0);await page.keyboard.press('Escape');
 await page.setViewportSize({width:360,height:800});
 for(const tab of ['Split a Bill','Regret Check-In','Settle Shares']){await page.getByRole('tab',{name:new RegExp(tab)}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.panel:visible').evaluateAll(async els=>{await Promise.all(els.flatMap(el=>el.getAnimations().map(a=>a.finished.catch(()=>{}))));});await page.screenshot({path:'test-results/lifecycle-mobile-'+tab.split(' ').join('-')+'.png',fullPage:true});}
 await page.evaluate(()=>window.scrollTo(0,0));await page.getByRole('button',{name:'Proof Drawer',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await page.locator('.proof-drawer').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});expect((await page.locator('.proof-drawer').boundingBox())!.x).toBe(0);await page.screenshot({path:'test-results/reference-mobile-proof.png'});
});
