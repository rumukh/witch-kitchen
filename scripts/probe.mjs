// Ad-hoc browser probe: node scripts/probe.mjs <url> <out.png> [steps...]
import { chromium } from '@playwright/test';
const [url, out, ...steps] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1200);
for (const s of steps) {
  const [kind, arg] = s.split('=');
  try {
    if (kind === 'click') await page.click(`[data-testid="${arg}"]`, { timeout: 3000 });
    else if (kind === 'text') await page.getByText(arg, { exact: false }).first().click({ timeout: 3000 });
    else if (kind === 'key') await page.keyboard.press(arg);
    else if (kind === 'wait') await page.waitForTimeout(Number(arg));
    else if (kind === 'shot') await page.screenshot({ path: arg });
  } catch (e) {
    logs.push(`[step-fail] ${s}: ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(250);
  logs.push(s + ' -> ' + (await page.evaluate(() => [...document.querySelectorAll('dialog')].map((d) => (d.open ? '' : 'CLOSED:') + (d.dataset.scene || d.dataset.card || d.querySelector('h2')?.textContent)).join(' | '))));
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
console.log('dialogs:', await page.evaluate(() => [...document.querySelectorAll('dialog')].map((d) => d.dataset.scene || d.dataset.card || d.querySelector('h2')?.textContent).join(' | ')));
await browser.close();
