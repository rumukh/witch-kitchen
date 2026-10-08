// Verifies that music cues are fetched at the right moments: title, night 1, tempo tiers, Межсветье.
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:5318/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const fetched = [];
const errors = [];
page.on('response', (r) => {
  const m = r.url().match(/(music-[a-z0-9-]+|ending-[a-z-]+)\.ogg$/);
  if (m) fetched.push(m[1]);
});
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(5000);
const drain = async () => {
  for (let i = 0; i < 30; i++) {
    const d = page.locator('dialog[open]');
    if (!(await d.count())) { await page.waitForTimeout(250); if (!(await d.count())) return; }
    for (const id of ['scene-skip', 'coach-ok', 'vow-decline', 'info-ok']) {
      const b = d.last().locator(`[data-testid="${id}"]`);
      if (await b.count()) { await b.click(); break; }
    }
    await page.waitForTimeout(150);
  }
};
await page.goto(base);
await page.click('[data-testid="info-ok"]');
await page.mouse.click(5, 5);
await page.waitForTimeout(800);
const chooser = page.waitForEvent('filechooser');
await page.click('[data-testid="import"]');
await (await chooser).setFiles('e2e/fixtures/night10.json');
await page.click('dialog[open] [data-testid="choice-1"]');
await page.click('[data-testid="continue-2"]');
await drain();
const order = [];
for (let i = 0; i < 16; i++) {
  await drain();
  const w = page.locator('[data-testid="wait"]:not([aria-disabled="true"])');
  if (await w.count()) await w.click();
  else {
    const g = page.locator('[data-testid^="refuse-"]:not([aria-disabled="true"])');
    if (await g.count()) { await g.first().click(); await page.click('dialog[open] [data-testid="confirm-yes"]'); }
    else break;
  }
  await page.waitForTimeout(400);
  order.push(fetched.at(-1));
}
await drain();
for (let i = 0; i < 20 && !(await page.locator('[data-testid="day"]').count()); i++) {
  await drain();
  const e = page.locator('[data-testid="end-night"]:not([aria-disabled="true"]), [data-testid="wait"]:not([aria-disabled="true"])');
  if (await e.count()) { await e.first().click(); const y = page.locator('dialog[open] [data-testid="confirm-yes"]'); if (await y.count()) await y.click(); }
  await page.waitForTimeout(300);
}
await drain();
await page.waitForTimeout(1500);
const uniq = [...new Set(fetched)];
console.log('music fetched in order:', uniq.join(' → '));
console.log('errors:', errors.length ? errors.join('; ') : 'none');
const need = ['music-title', 'music-night-calm', 'music-night-middle', 'music-night-predawn', 'music-mezhsvetye'];
const ok = need.every((n) => uniq.includes(n)) && !errors.length && uniq.indexOf('music-night-calm') < uniq.indexOf('music-night-middle') && uniq.indexOf('music-night-middle') < uniq.indexOf('music-night-predawn');
console.log(ok ? 'MUSIC PROBE: PASS' : 'MUSIC PROBE: FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
