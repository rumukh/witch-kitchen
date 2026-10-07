// Debug helper: play via the generic UI step until a click hangs, then dump the JS stack via CDP.
import { chromium } from '@playwright/test';
const { step } = await import('../e2e/steps.mjs');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Debugger.enable');
let paused = null;
cdp.on('Debugger.paused', (e) => {
  paused = e;
});
page.setDefaultTimeout(6000);
await page.goto(`http://localhost:5310/?seed=${process.argv[2] ?? 'e2e-one'}`);
await page.locator('[data-testid="info-ok"]').click();
await page.locator('[data-testid="new-1"]').click();
await page.locator('[data-testid="choice-0"]').click();
const log = [];
for (let i = 0; i < Number(process.argv[3] ?? 600); i++) {
  try {
    const r = await step(page);
    log.push(r);
    if (r === 'day' && !(await page.locator('dialog[open]').count())) {
      await page.locator('[data-testid="next-night"]').click();
      log.push('NEXT');
    }
  } catch (e) {
    console.log('STEP FAILED after', log.slice(-12).join(','), e.message);
    await cdp.send('Debugger.pause');
    await new Promise((r) => setTimeout(r, 1500));
    if (paused) for (const f of paused.callFrames.slice(0, 15)) console.log(f.functionName, f.url.split('/').pop(), f.location.lineNumber, f.location.columnNumber);
    break;
  }
}
console.log('steps', log.length, log.filter((x) => x === 'NEXT').length, 'nights advanced');
await browser.close();

