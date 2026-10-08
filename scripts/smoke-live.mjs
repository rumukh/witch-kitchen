// Smoke test against a deployed site: node scripts/smoke-live.mjs [url]
// Starts a new game, takes a few night-1 actions, checks assets loaded and no errors, reloads and resumes.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://rumukh.github.io/witch-kitchen/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const failed = [];
const loaded = new Set();
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  else if (/\.(webp|ogg|json|js|css)$/.test(new URL(r.url()).pathname)) loaded.add(new URL(r.url()).pathname.split('.').pop());
});
page.setDefaultTimeout(15000);
const drain = async () => {
  for (let i = 0; i < 30; i++) {
    const d = page.locator('dialog[open]');
    if (!(await d.count())) {
      await page.waitForTimeout(300);
      if (!(await d.count())) return;
    }
    for (const id of ['scene-skip', 'coach-ok', 'info-ok']) {
      const b = d.last().locator(`[data-testid="${id}"]`);
      if (await b.count()) {
        await b.click();
        break;
      }
    }
    await page.waitForTimeout(200);
  }
};
await page.goto(url + '?seed=live-smoke');
await page.locator('[data-testid="info-ok"]').click();
const slot = page.locator('[data-testid="new-1"]');
if (!(await slot.count())) {
  await page.locator('[data-testid="delete-1"]').click();
  await page.locator('dialog[open] [data-testid="confirm-yes"]').click();
}
await page.locator('[data-testid="new-1"]').click();
await page.locator('[data-testid="choice-0"]').click();
await page.locator('[data-testid="tavern"]').waitFor();
await drain();
await page.locator('[data-testid="clean-0"]').click();
await drain();
await page.locator('[data-testid="kupa"]').click();
await drain();
await page.locator('[data-testid="cook"]').click();
await page.locator('dialog[open] .choice:not([aria-disabled="true"])').first().click();
await drain();
const tick = await page.locator('.clock-text').textContent();
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.screenshot({ path: 'docs/screens/live-pages-night1.png' });
await page.reload();
await page.locator('[data-testid="continue-1"]').click();
await page.locator('[data-testid="tavern"]').waitFor();
const tick2 = await page.locator('.clock-text').textContent();
const sw = await page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0));
const dbs = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
console.log(`url ${url}`);
console.log(`after 3 actions: ${tick}; after reload: ${tick2}`);
console.log(`loaded types: ${[...loaded].sort().join(',')}; service workers: ${sw}; IndexedDB: ${dbs.join(',')}`);
console.log(`errors: ${errors.length ? errors.join('; ') : 'none'}; failed requests: ${failed.length ? failed.join('; ') : 'none'}`);
const ok = tick === tick2 && /Тик 3/.test(tick ?? '') && !errors.length && !failed.length && sw === 0 && loaded.has('webp') && loaded.has('ogg');
console.log(ok ? 'LIVE SMOKE: PASS' : 'LIVE SMOKE: FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
