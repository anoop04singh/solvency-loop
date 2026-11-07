import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
declare global {interface Window {shaderDraws:number;}}
let bundle:string;
test.beforeAll(async()=>{const result=await build({entryPoints:[fileURLToPath(new URL('../fixtures/agent-preview.tsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});bundle=result.outputFiles[0].text;});
async function openAgent(page:Page,request:APIRequestContext){
 const html=await(await request.get('/app')).text(),styles=Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g),m=>m[0]).join('');expect(styles).not.toBe('');
 await page.route('**/__agent_bundle.js',r=>r.fulfill({contentType:'application/javascript',body:bundle}));
 await page.route('**/__agent_fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+styles+'</head><body><div id="ui-root"></div><script type="module" src="/__agent_bundle.js"></script></body></html>'}));
 await page.goto('/__agent_fixture');await expect(page.getByRole('heading',{name:/Fixture owner/})).toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
const send=async(page:Page)=>{await page.getByRole('textbox',{name:'Message SolvencyLoop'}).fill('My actual dinner request with Casey');await page.getByRole('button',{name:'Ask agent',exact:true}).click();await expect(page.locator('.agent-response-card')).toHaveCount(1);};
test('funded confirmed responses show actual receipt status while Draft only preserves manual review',async({page,request})=>{
 await openAgent(page,request);await page.getByText('Isolated agent fixture controls',{exact:true}).click();await page.getByLabel('Enable fixture funded authority',{exact:true}).check();
 await page.getByRole('textbox',{name:'Message SolvencyLoop'}).fill('An actual eligible command');await page.getByRole('button',{name:'Run within limits',exact:true}).click();
 const card=page.locator('.agent-response-card');await expect(card).toContainText('Confirmed on Sui');await expect(card.locator('.agent-reply')).toContainText('transaction is confirmed');await expect(card.locator('.agent-allocation-heading')).toContainText('confirmed on Sui');await expect(card.getByRole('button',{name:'Review split',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'New conversation',exact:true}).click();await page.getByLabel('Draft only for this message',{exact:true}).check();await send(page);await expect(card.getByRole('button',{name:'Review split',exact:true})).toBeEnabled();await expect(card).not.toContainText('Confirmed on Sui');
});
test('chat starts blank, renders a tab-only proposal and requires separate review before wallet approval',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await openAgent(page,request);
 const input=page.getByRole('textbox',{name:'Message SolvencyLoop'});
 await expect(input).toHaveValue('');await expect(page.getByRole('log')).toHaveCount(0);await expect(page.getByRole('button',{name:'Ask agent',exact:true})).toBeDisabled();
 await input.fill('My actual dinner request with Casey');
 await expect(page.getByRole('log')).toHaveCount(0);
 await input.clear();
 await page.screenshot({path:'test-results/agent-desktop-empty.png',fullPage:true});await send(page);
 await expect(page.getByRole('button',{name:'Inspect Walrus proof',exact:true})).toHaveCount(0);
 await expect(page.locator('.agent-allocations')).toContainText('16.500001 USDC total');await expect(page.locator('.agent-allocation-row').filter({hasText:'You'})).toContainText('8.250001 USDC');
 expect(await page.evaluate(()=>window.__agentConfirmed)).toBeUndefined();await page.getByRole('button',{name:'Review split',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Review split?'});await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Bill title')).toHaveValue('Fixture user dinner');await dialog.getByLabel('Bill title').fill('Travel tickets');await dialog.getByLabel('Bill category').selectOption('travel');
 await expect(dialog.locator('.agent-bill-total')).toContainText('Travel tickets');await expect(dialog.locator('.agent-bill-total')).toContainText('Travel & transport');
 expect(await page.evaluate(()=>window.__agentConfirmed)).toBeUndefined();await page.screenshot({path:'test-results/agent-review-dialog.png',fullPage:true});
 await page.getByRole('button',{name:'Create split',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.agent-response-card')).toContainText('Confirmed on Sui');
 expect(await page.evaluate(()=>window.__agentSplitReview)).toEqual({title:'Travel tickets',category:'travel'});
 await expect(page.getByRole('button',{name:'Review split',exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});
test('composer signals a pending reply and retains the message for retry after a Gemini error',async({page,request})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await openAgent(page,request);await page.getByText('Isolated agent fixture controls').click();await page.getByLabel('Hold agent response').check();await page.getByLabel('Fail agent reply').check();
 const input=page.getByRole('textbox',{name:'Message SolvencyLoop'}),composer=page.locator('.agent-composer');
 await input.fill('My real request');await input.press('Shift+Enter');expect(await page.evaluate(()=>window.__agentRequests)).toBeUndefined();
 const before=await composer.getByRole('button',{name:'Ask agent',exact:true}).boundingBox();
 await input.press('Enter');
 const waiting=composer.getByRole('button',{name:'Waiting…',exact:true});
 await expect(waiting).toBeDisabled();await expect(composer).toHaveAttribute('aria-busy','true');
 const panel=page.getByRole('region',{name:'Conversation',exact:true});
 await expect(panel).toHaveCSS('backdrop-filter','blur(18px)');
 await expect(panel).toHaveCSS('background-color','rgba(255, 255, 255, 0.57)');
 await expect(panel.locator('.agent-chat-reveal')).toHaveCSS('animation-name','none');
 expect((await waiting.boundingBox())?.width).toBe(before?.width);
 await expect(composer.locator('.agent-send-spinner')).toHaveCSS('animation-name','none');
 await expect(page.locator('.agent-response-card')).toHaveCount(0);await expect(input).toBeDisabled();
 await page.getByRole('button',{name:'Finish response',exact:true}).click();
 await expect(page.locator('#agent-chat-error')).toContainText('Try sending your message again.');
 await expect(composer).toHaveAttribute('aria-busy','false');await expect(page.locator('.agent-response-card')).toHaveCount(0);await expect(input).toHaveValue(/My real request/);
 await page.getByLabel('Hold agent response').uncheck();await page.getByLabel('Fail agent reply').uncheck();
 await composer.getByRole('button',{name:'Ask agent',exact:true}).click();
 await expect(page.locator('.agent-response-card')).toHaveCount(1);await expect(page.locator('#agent-chat-error')).toHaveCount(0);await expect(input).toHaveValue('');
});
test('a clarification and its reply box stay together on a small screen',async({page,request})=>{
 await page.setViewportSize({width:360,height:680});
 await openAgent(page,request);
 const chat=page.getByRole('region',{name:'Conversation',exact:true}),log=chat.getByRole('log');
 const input=page.getByRole('textbox',{name:'Message SolvencyLoop'});
 await input.fill('Split dinner with an unknown contact');
 await page.getByRole('button',{name:'Ask agent',exact:true}).click();
 await expect(log.getByText('Which saved contact should share this bill?')).toBeInViewport({ratio:1});
 await expect(input).toBeInViewport({ratio:1});
 await expect(input).toHaveAttribute('placeholder','Reply to SolvencyLoop…');
 await input.fill('Casey');
 await chat.getByRole('button',{name:'Send reply',exact:true}).click();
 await expect(log.getByText('Review these calculated shares before wallet approval.')).toBeInViewport({ratio:1});
 await expect.poll(()=>log.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
 await expect(input).toBeInViewport({ratio:1});
 await expect(chat.getByRole('textbox')).toHaveCount(1);
 expect(await page.evaluate(()=>window.__agentRequests)).toEqual(['Split dinner with an unknown contact','Casey']);
});
test('restored proposals cannot execute; manual editing and workspace navigation remain available',async({page,request})=>{
 await openAgent(page,request);await send(page);await page.getByText('Isolated agent fixture controls').click();await page.getByLabel('Restored conversation only').check();await expect(page.getByRole('button',{name:'Review split',exact:true})).toHaveCount(0);await expect(page.getByText('Ask again to prepare a fresh action.')).toBeVisible();
 await page.getByRole('button',{name:'Edit items manually',exact:true}).click();await expect(page.getByRole('heading',{name:'Fixture user dinner',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.__agentEdited)).toBe('fixture-turn-0');
 await page.getByRole('button',{name:'Agent',exact:true}).click();await expect(page.locator('.agent-response-card')).toHaveCount(1);
 await page.getByRole('button',{name:'New conversation',exact:true}).click();await expect(page.getByRole('log')).toHaveCount(0);
 await page.getByRole('button',{name:/Cooldown Vault/}).click();await expect(page.getByText('Savings manual workspace selected')).toBeVisible();
});
test('mobile agent layout and allocations fit without horizontal scrolling',async({page,request})=>{
 await page.setViewportSize({width:360,height:800});await openAgent(page,request);await send(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await expect(page.getByRole('button',{name:'Review split',exact:true})).toBeEnabled();await expect(page.locator('.agent-conversation article').last()).toHaveCSS('opacity','1');await page.screenshot({path:'test-results/agent-mobile-conversation.png',fullPage:true});
 await page.getByRole('button',{name:'Review split',exact:true}).click();await expect(page.getByRole('button',{name:'Create split',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
test('Audit exposes committed preferences, correction and stop using',async({page,request})=>{
 await openAgent(page,request);
 await page.getByRole('button',{name:'Memory & preferences',exact:true}).click();
 const learned=page.locator('section').filter({has:page.getByRole('heading',{name:'What the agent remembers',exact:true})});
 await expect(learned.getByText('north market',{exact:true})).toBeVisible();
 await expect(learned.getByText('Groceries',{exact:true})).toBeVisible();
 await learned.getByRole('button',{name:'Edit',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox').selectOption('shopping');
 await dialog.getByRole('button',{name:'Save correction',exact:true}).click();
 await expect(learned.getByText('Shopping',{exact:true})).toBeVisible();
 await learned.getByRole('button',{name:'Stop using',exact:true}).click();
 await expect(learned.getByText('north market',{exact:true})).toHaveCount(0);
});
test('reference shader pauses, handles context loss and cleans up on workspace unmount',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await openAgent(page,request);await expect(page.locator('.agent-shader canvas')).toHaveCount(1);await expect(page.locator('.agent-shader')).toHaveAttribute('data-fallback','false');
 await page.getByRole('button',{name:'Pause background animation',exact:true}).click();await expect(page.locator('.agent-shader')).toHaveAttribute('data-fallback','true');await page.getByRole('button',{name:'Resume background animation',exact:true}).click();await expect(page.locator('.agent-shader')).toHaveAttribute('data-fallback','false');
 await page.evaluate(()=>{const gl=document.querySelector<HTMLCanvasElement>('.agent-shader canvas')!.getContext('webgl')!,w=window as Window&{shaderDraws:number};w.shaderDraws=0;const draw=gl.drawArrays.bind(gl);gl.drawArrays=(...args)=>{w.shaderDraws++;draw(...args);};gl.getExtension('WEBGL_lose_context')?.loseContext();});await expect(page.locator('.agent-shader')).toHaveAttribute('data-fallback','true');
 const draws=await page.evaluate(async()=>{const w=window as Window&{shaderDraws:number},before=w.shaderDraws;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return {before,after:w.shaderDraws};});expect(draws.after).toBe(draws.before);
 await page.getByRole('button',{name:'Split Canvas',exact:true}).click();await expect(page.locator('.agent-shader canvas')).toHaveCount(0);expect(errors).toEqual([]);
});
test('reduced motion uses a static shader fallback and responds to preference changes',async({page,request})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await openAgent(page,request);await expect(page.locator('.agent-shader')).toHaveAttribute('data-fallback','true');
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.locator('.agent-shader')).toHaveAttribute('data-fallback','false');
});
