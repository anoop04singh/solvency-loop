import { expect, test } from '@playwright/test';

test('landing explains each feature, exposes details and opens mandatory onboarding', async ({ page }) => {
  const errors: string[] = [];
  const chainCalls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/api\/(tatum-rpc|memory)/.test(request.url())) chainCalls.push(request.url()); });
  await page.goto('/');
  const headline = page.getByRole('heading', { name: 'Smart money that remembers.' });
  await expect(headline).toBeVisible();
  const article=page.locator('.landing-header').getByRole('link',{name:'Read the technical blog (opens in a new tab)'});
  await expect(article).toHaveAttribute('href','https://anoopsinghwork.notion.site/SolvencyLoop-Building-a-Financial-Assistant-That-Remembers-What-Actually-Happened-41458f741fb5806bb9d4ff7cdc8ab980');await expect(article).toHaveAttribute('target','_blank');await expect(article).toHaveAttribute('rel','noopener noreferrer');
  await expect(headline).toHaveCSS('font-family', /Hanken Grotesk/);
  const shader = page.locator('.landing-hero-shader');
  await expect(shader).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await expect(shader).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume motion', exact: true }).click();
  await expect(shader).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/desktop-landing.png', animations: 'disabled' });
  const preview = page.getByRole('region', { name: 'Workflow preview' });
  await preview.getByRole('button', { name: 'Purchase reflection' }).click();
  await expect(preview.getByText('Wait 6 hours', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Cooldown vault' }).click();
  await expect(preview.getByText('Withdraw', { exact: true })).toBeVisible();
  await page.getByText('Data and approvals', { exact: true }).click();
  await expect(page.getByText('account-wide memory access', { exact: false })).toBeVisible();
  expect(chainCalls).toEqual([]);
  await page.getByRole('link', { name: 'Open app', exact: false }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Start with your Sui wallet' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /workspace/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open account and proof' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('legacy bill links redirect while preserving the split ID', async ({ request }) => {
  const id = '0x' + 'a'.repeat(64); // Routing fixture only; never submitted as a wallet or object lookup.
  const response = await request.get('/?split=' + id, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/app?split=' + id);
});

test('mobile landing and workspace fit narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ['/', '/app']) {
    const setup=route==='/app'?page.waitForResponse(response=>response.url().endsWith('/api/config')):null;
    await page.goto(route);
    if(setup) { await setup; await expect(page.locator('.loading-state')).toHaveCount(0); }
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    if (route === '/') {
      await expect(page.locator('.landing-header').getByRole('link',{name:'Read the technical blog (opens in a new tab)'})).toBeVisible();
      await page.evaluate(()=>document.fonts.ready);
      await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);await expect(page.locator('.landing-header').getByRole('link',{name:'Read the technical blog (opens in a new tab)'})).toBeVisible();await page.setViewportSize({width:360,height:800});
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: 'test-results/mobile-landing.png', animations: 'disabled' });
      const chapters = page.getByRole('region', { name: 'SolvencyLoop feature chapters' });
      await chapters.press('ArrowRight');
      await expect(page.getByRole('heading', { name: 'Carry useful context forward' })).toBeInViewport({ ratio: .8 });
      const nextChapter = page.getByRole('button', { name: 'Next chapter' });
      await nextChapter.click();
      await expect(nextChapter).toHaveAttribute('aria-disabled', 'true');
      await chapters.scrollIntoViewIfNeeded();
      await expect(page.getByRole('heading', { name: 'Choose a 24-hour cooldown' })).toBeInViewport({ ratio: .8 });
    }
  }
  await expect(page.getByRole('button',{name:'Connect Wallet',exact:true})).toBeInViewport();
  await page.screenshot({ path: 'test-results/mobile-workspace.png', fullPage: true });
});

test('real configuration failures turn the presentation red without opening the app', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/app');
  await expect(page.getByRole('alert').filter({ hasText: 'Service configuration could not be checked.' })).toBeVisible();
  await expect(page.locator('.app-atmosphere')).toHaveAttribute('data-outcome', 'error');
  await expect(page.getByText('Needs your attention', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with your Sui wallet' })).toBeVisible();
});

test('Vanta creates one canvas, releases it on pause and unmount, and handles context loss', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  await expect(page.locator('.fog-canvas canvas')).toHaveCount(1);
  await expect(page.locator('.app-atmosphere')).toHaveAttribute('data-outcome', 'neutral');
  await page.getByRole('button', { name: 'Pause background', exact: true }).click();
  await expect(page.locator('.fog-canvas canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Animate background', exact: true }).click();
  await expect(page.locator('.fog-canvas canvas')).toHaveCount(1);
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.fog-canvas canvas')!;
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByText('Static background', { exact: true })).toBeVisible();
  await expect(page.locator('.fog-canvas canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'Open account and proof'}).click();
  await page.getByRole('link', { name: 'About SolvencyLoop' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.app-atmosphere[data-context="workspace"]')).toHaveCount(0);
  await expect(page.locator('.app-atmosphere[data-context="landing"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('reduced motion uses the static palette and retains feature controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.getByText('Reduced motion', { exact: true })).toBeVisible();
  await expect(page.locator('.fog-canvas canvas')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('.landing-hero-shader')).toHaveCount(0);
  await page.getByRole('button', { name: 'Purchase reflection' }).click();
  await expect(page.getByText('Wait 6 hours', { exact: true })).toBeVisible();
});

test('landing remains readable and actionable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole('heading', { name: 'Smart money that remembers.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Launch web app', exact: true })).toHaveAttribute('href', '/app');
  await expect(page.locator('.landing-header').getByRole('link',{name:'Read the technical blog (opens in a new tab)'})).toBeVisible();
  await page.getByText('Data and approvals', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('account-wide memory access', { exact: false })).toBeVisible();
  await context.close();
});

test('service loading has an honest animated status and clears when the request completes', async ({ page }) => {
  let complete:()=>void=()=>{};
  const pending=new Promise<void>(resolve=>{complete=resolve;});
  await page.route('**/api/config',async route=>{await pending;await route.fulfill({json:{configured:true,missing:[]}});});
  await page.goto('/app');
  await expect(page.getByText('Checking service availability',{exact:true})).toBeVisible();
  await expect(page.locator('.loading-orbit')).toBeVisible();
  await page.screenshot({path:'test-results/loading-workspace.png'});
  await page.getByRole('button',{name:'Open account and proof'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  complete();
  await expect(page.getByText('Checking service availability',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading',{name:'Start with your Sui wallet'})).toBeVisible();
});
