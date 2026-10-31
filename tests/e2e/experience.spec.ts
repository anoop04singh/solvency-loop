import { expect, test } from '@playwright/test';

test('landing explains each feature, exposes details and opens mandatory onboarding', async ({ page }) => {
  const errors: string[] = [];
  const chainCalls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/api\/(tatum-rpc|memory)/.test(request.url())) chainCalls.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Less money on your mind.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-landing.png' });
  await page.getByRole('button', { name: /Remember what matters/ }).click();
  await expect(page.getByRole('heading', { name: 'Keep the lesson. Leave the mental load.' })).toBeVisible();
  await page.getByRole('button', { name: /Pause thoughtfully/ }).click();
  await expect(page.getByRole('img', { name: 'A 24-hour pause surrounds protected funds' })).toBeVisible();
  await page.getByText('Does SolvencyLoop move money for me?', { exact: true }).click();
  await expect(page.getByText('Saving a preference or a note does not authorize a payment.', { exact: false })).toBeVisible();
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
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    if (route === '/') await page.screenshot({ path: 'test-results/mobile-landing.png' });
  }
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
  await page.getByRole('link', { name: 'About SolvencyLoop' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.app-atmosphere')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reduced motion uses the static palette and retains feature controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.getByText('Reduced motion', { exact: true })).toBeVisible();
  await expect(page.locator('.fog-canvas canvas')).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('button', { name: /Remember what matters/ }).click();
  await expect(page.getByRole('heading', { name: 'Keep the lesson. Leave the mental load.' })).toBeVisible();
});

test('landing remains readable and actionable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole('heading', { name: 'Less money on your mind.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Make a little room' })).toHaveAttribute('href', '/app');
  await context.close();
});
