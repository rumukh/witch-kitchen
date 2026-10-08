import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const bad = []; const audio = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); if (/\.ogg$/.test(r.url())) audio.push(r.url().split('/').pop()); });
page.on('pageerror', (e) => bad.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') bad.push('console ' + m.text()); });
await page.goto('http://localhost:5310/?seed=audio');
await page.click('[data-testid="info-ok"]');
await page.click('[data-testid="new-1"]');
await page.click('[data-testid="choice-0"]');
await page.waitForTimeout(1500);
for (let i = 0; i < 6; i++) { const b = page.locator('dialog[open] [data-testid="scene-next"], dialog[open] [data-testid="coach-ok"]'); if (await b.count()) await b.first().click(); await page.waitForTimeout(700); }
await page.waitForTimeout(1500);
console.log('ogg fetched:', audio.length, audio.slice(0, 12).join(', '));
console.log('errors:', bad.length ? bad.join('\n') : 'none');
await browser.close();

