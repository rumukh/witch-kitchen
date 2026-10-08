import type { Page } from '@playwright/test';

/** Generic UI player: drives the game only through visible controls (mouse clicks on buttons). */
export async function step(page: Page): Promise<string> {
  await page.waitForTimeout(120);
  try {
    return await stepInner(page);
  } catch {
    return 'retry';
  }
}

async function stepInner(page: Page): Promise<string> {
  page.setDefaultTimeout(3000);
  const dialog = page.locator('dialog[open]').last();
  if (await dialog.count()) {
    for (const id of ['vow-accept', 'coach-ok', 'info-ok', 'scene-skip', 'confirm-yes', 'reply-warm']) {
      const b = dialog.locator(`[data-testid="${id}"]`);
      if (await b.count()) {
        await b.first().click();
        return id;
      }
    }
    const choice = dialog.locator('.choice:not([aria-disabled="true"])');
    if (await choice.count()) {
      await choice.first().click();
      return 'choice';
    }
    await dialog.locator('button').last().click();
    return 'dialog-button';
  }
  if (await page.locator('[data-testid="day"]').count()) return 'day';
  if (await page.locator('[data-testid="ending"]').count()) return 'ending';
  const enabled = (sel: string) => page.locator(`${sel}:not([aria-disabled="true"])`);
  const tray = page.locator('[data-testid="tray"].filled');
  if (await tray.count()) {
    const empty = page.locator('.shelf-grid .cell.empty');
    if (await empty.count()) {
      await tray.click();
      await empty.first().click();
      return 'tray->shelf';
    }
    await tray.click();
    await page.locator('[data-testid="burn-selected"]').click();
    return 'burn-tray';
  }
  const serve = enabled('[data-testid^="serve-"]');
  if (await serve.count()) {
    await serve.first().click();
    const modal = page.locator('dialog[open]').last();
    const options = modal.locator('.choice:not([aria-disabled="true"])');
    if ((await options.count()) > 0) {
      await options.first().click();
      return 'serve';
    }
    await modal.locator('[data-testid="choice-cancel"]').click();
  }
  for (const sel of ['[data-testid^="clean-"]']) {
    const b = enabled(sel);
    if (await b.count()) {
      await b.first().click();
      return sel;
    }
  }
  if (!(await page.locator('.burner.brewing, .burner.ready').count())) {
    await page.locator('[data-testid="cook"]').click();
    const modal = page.locator('dialog[open]').last();
    const options = modal.locator('.choice:not([aria-disabled="true"])');
    if ((await options.count()) > 0) {
      await options.first().click();
      return 'cook';
    }
    await modal.locator('[data-testid="choice-cancel"]').click();
  }
  const listen = enabled('.pal-jar:not(.core)');
  if (await listen.count()) {
    await listen.first().click();
    return 'listen';
  }
  for (const id of ['wait', 'end-night']) {
    const b = enabled(`[data-testid="${id}"]`);
    if (await b.count()) {
      await b.click();
      return id;
    }
  }
  const refuse = enabled('[data-testid^="refuse-"]');
  if (await refuse.count()) {
    await refuse.first().click();
    return 'refuse';
  }
  return 'stuck';
}

export async function playUntilDay(page: Page, night: number): Promise<string[]> {
  const log: string[] = [];
  for (let i = 0; i < 400; i++) {
    const r = await step(page);
    log.push(r);
    if (process.env.E2E_VERBOSE) console.log(night, i, r);
    if (r === 'day' && !(await page.locator('dialog[open]').count())) return log;
    if (r === 'stuck' && log.slice(-5).every((x) => x === 'stuck')) throw new Error(`stuck in night ${night}: ${log.slice(-20).join(',')}`);
    await page.waitForTimeout(30);
  }
  throw new Error(`night ${night} did not finish: ${log.slice(-30).join(',')}`);
}


