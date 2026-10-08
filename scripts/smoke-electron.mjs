// Desktop smoke test: node scripts/smoke-electron.mjs
// Launches the packaged Krestets.exe twice with an isolated save dir; plays, quits, relaunches, resumes.
import { _electron as electron } from '@playwright/test';
import { mkdtempSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.env.KRESTETS_EXE || join('dist', 'win', 'Krestets-win32-x64', 'Krestets.exe');
const exe2 = process.env.KRESTETS_EXE2 || exe;
const saveDir = process.env.KRESTETS_SAVE_DIR || mkdtempSync(join(tmpdir(), 'krestets-smoke-'));
const env = { ...process.env, KRESTETS_SAVE_DIR: saveDir };
const out = [];
const blocked = [];

async function launch(path = exe) {
  const app = await electron.launch({ executablePath: path, env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => out.push('pageerror ' + e.message));
  page.on('requestfailed', (r) => blocked.push(r.url()));
  page.setDefaultTimeout(8000);
  await page.waitForSelector('[data-testid="slot-1"]');
  return { app, page };
}

let { app, page } = await launch();
const size = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
out.push(`window ${size.join('x')}; native bridge: ${await page.evaluate(() => !!window.krestetsNative)}`);
await page.click('[data-testid="new-1"]');
await page.click('[data-testid="choice-0"]');
await page.waitForSelector('[data-testid="tavern"]');
// Dismiss scenes/cards, then take tick-spending actions.
for (let i = 0; i < 30; i++) {
  const d = page.locator('dialog[open]');
  if (!(await d.count())) break;
  for (const id of ['scene-skip', 'coach-ok']) {
    const b = d.last().locator(`[data-testid="${id}"]`);
    if (await b.count()) {
      await b.click();
      break;
    }
  }
  await page.waitForTimeout(150);
}
await page.click('[data-testid="clean-0"]');
await page.waitForTimeout(300);
while (await page.locator('dialog[open] [data-testid="coach-ok"]').count()) {
  await page.click('dialog[open] [data-testid="coach-ok"]');
  await page.waitForTimeout(150);
}
await page.click('[data-testid="kupa"]');
await page.waitForTimeout(300);
while (await page.locator('dialog[open] [data-testid="coach-ok"]').count()) {
  await page.click('dialog[open] [data-testid="coach-ok"]');
  await page.waitForTimeout(150);
}
const before = await page.locator('.clock-text').textContent();
const heat = await page.locator('[data-testid="stat-heat"] b').textContent();
await page.screenshot({ path: 'docs/screens/electron-night1.png' });
out.push(`before quit: ${before}, heat ${heat}, save status: ${await page.locator('[data-testid="save-status"]').textContent()}`);
await app.close();

({ app, page } = await launch(exe2));
await page.click('[data-testid="continue-1"]');
await page.waitForSelector('[data-testid="tavern"]');
const after = await page.locator('.clock-text').textContent();
const heat2 = await page.locator('[data-testid="stat-heat"] b').textContent();
out.push(`after relaunch: ${after}, heat ${heat2}`);
await app.close();

const files = existsSync(join(saveDir, 'io.github.rumukh.krestets')) ? readdirSync(join(saveDir, 'io.github.rumukh.krestets')) : [];
const slot = files.includes('slot-1.json') ? JSON.parse(readFileSync(join(saveDir, 'io.github.rumukh.krestets', 'slot-1.json'), 'utf8')) : null;
out.push(`save files: ${files.join(', ')}; slot-1 revision ${slot?.current?.revision}; previous kept: ${!!slot?.previous}`);
out.push(`non-app requests blocked: ${blocked.filter((u) => !u.startsWith('app://krestets/')).length}`);
const ok = before === after && heat === heat2 && slot?.current && !out.some((l) => l.startsWith('pageerror'));
console.log(out.join('\n'));
console.log(ok ? 'ELECTRON SMOKE: PASS' : 'ELECTRON SMOKE: FAIL');
process.exit(ok ? 0 : 1);
