import { expect, test, type Page } from '@playwright/test';
import { step } from './helpers.js';

async function drain(page: Page) {
  for (let quiet = 0, i = 0; i < 60 && quiet < 2; i++) {
    if (await page.locator('dialog[open]').count()) {
      quiet = 0;
      await step(page);
    } else {
      quiet++;
      await page.waitForTimeout(200);
    }
  }
}

async function noCoach(page: Page) {
  await page.locator('[data-testid="settings"]').click();
  const box = page.locator('[data-testid="set-onboarding"]');
  if (await box.isChecked()) await box.uncheck();
  await page.keyboard.press('Escape');
}

async function importFixture(page: Page, file: string, slot: number) {
  await page.goto('./');
  await page.locator('[data-testid="info-ok"]').click();
  await noCoach(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-testid="import"]').click();
  await (await chooser).setFiles(file);
  await page.locator(`dialog[open] [data-testid="choice-${slot - 1}"]`).click();
  await expect(page.locator(`[data-testid="continue-${slot}"]`)).toBeVisible();
}

test('title, settings and 150% text screens', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-testid="info-ok"]').click();
  await page.screenshot({ path: 'docs/screens/title.png' });
  await page.locator('[data-testid="settings"]').click();
  await page.locator('[data-testid="set-text"]').selectOption('150');
  await page.screenshot({ path: 'docs/screens/settings-150.png' });
  await page.keyboard.press('Escape');
  await noCoach(page);
  await page.locator('[data-testid="new-1"]').click();
  await page.locator('[data-testid="choice-1"]').click(); // Granny
  await drain(page);
  await page.screenshot({ path: 'docs/screens/tavern-night1-150pct.png' });
  // Keyboard-only: focus the clean button with Tab and press Enter (no pointer).
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.testid)) === 'clean-0') break;
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.clock-text')).toContainText('Тик 1');
  await drain(page);
  await page.keyboard.press('KeyW');
  await expect(page.locator('.clock-text')).toContainText('Тик 2');
  // Essential content stays reachable at 150% text: no horizontal overflow of the page.
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.panel, .hud, .action-bar')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; }).map((el) => el.className));
  expect(clipped).toEqual([]);
});

test('night 10 fixture: listen dialog, cook list, Межсветье tabs', async ({ page }) => {
  await importFixture(page, 'e2e/fixtures/night10.json', 2);
  await page.locator('[data-testid="continue-2"]').click();
  await drain(page);
  await page.screenshot({ path: 'docs/screens/tavern-night10.png' });
  const listen = page.locator('.pal-jar:not(.core):not([aria-disabled="true"])').first();
  if (await listen.count()) {
    await listen.click();
    await page.screenshot({ path: 'docs/screens/listen-dialog.png' });
    await page.locator('dialog[open] [data-testid="reply-warm"]').click();
    await drain(page);
  }
  await page.locator('[data-testid="cook"]').click();
  await page.screenshot({ path: 'docs/screens/cook-dialog.png' });
  await page.locator('dialog[open] [data-testid="choice-cancel"]').click();
  for (let i = 0; i < 300 && !(await page.locator('[data-testid="day"]').count()); i++) {
    const r = await step(page);
    if (r === 'stuck') break;
  }
  await drain(page);
  for (const tab of ['report', 'shelf', 'shop', 'tarot', 'recipes', 'stories', 'vows', 'tram']) {
    await page.locator(`[data-testid="tab-${tab}"]`).click();
    await drain(page);
    await page.screenshot({ path: `docs/screens/day-${tab}.png` });
  }
});

test('night 12 fixture: best ending through the UI, then Wound via the pre-finale checkpoint', async ({ page }) => {
  await importFixture(page, 'e2e/fixtures/night12.json', 3);
  await page.locator('[data-testid="continue-3"]').click();
  await drain(page);
  await page.screenshot({ path: 'docs/screens/tavern-night12.png' });
  let pieCooked = false;
  for (let i = 0; i < 200 && !(await page.locator('[data-testid="ending"]').count()); i++) {
    if (await page.locator('dialog[open]').count()) {
      await step(page);
      continue;
    }
    const nameless = await page.locator('[data-testid="nameless"]').count();
    const ready = page.locator('.burner.ready [data-testid^="serve-"]');
    if (pieCooked && nameless && (await ready.count())) {
      await ready.first().click();
      await page.locator('dialog[open] .choice', { hasText: 'Гость без имени' }).click();
      continue;
    }
    if (!pieCooked && (nameless || (await page.locator('.clock-text').textContent())?.match(/Тик ([6-9]|1\d)/))) {
      await page.locator('[data-testid="cook"]').click();
      const pie = page.locator('dialog[open] .choice', { hasText: 'Пирог из собственной памяти' });
      if ((await pie.count()) && (await pie.getAttribute('aria-disabled')) !== 'true') {
        await pie.click();
        await drain(page);
        pieCooked = true;
        continue;
      }
      await page.locator('dialog[open] [data-testid="choice-cancel"]').click();
      const kupa = page.locator('[data-testid="kupa"]:not([aria-disabled="true"])');
      if ((await page.locator('[data-testid="stat-heat"] b').textContent())?.startsWith('0') && (await kupa.count())) {
        await kupa.click();
        continue;
      }
    }
    const listen = page.locator('.pal-jar:not(.core):not([aria-disabled="true"])', { hasText: 'Ностальгия' });
    if (!pieCooked && (await listen.count())) {
      await listen.first().click();
      await page.locator('dialog[open] [data-testid="reply-warm"]').click();
      continue;
    }
    const wait = page.locator('[data-testid="wait"]:not([aria-disabled="true"])');
    if (await wait.count()) await wait.click();
    else await page.locator('[data-testid="end-night"]').click();
  }
  await drain(page);
  await expect(page.locator('[data-testid="ending"]')).toHaveAttribute('data-ending', 'new_spring');
  await page.screenshot({ path: 'docs/screens/ending-new-spring.png' });
  await page.locator('[data-testid="restore-prefinale"]').click();
  await page.locator('dialog[open] [data-testid="confirm-yes"]').click();
  await expect(page.locator('[data-testid="day"]')).toBeVisible();
  await page.locator('[data-testid="next-night"]').click();
  await drain(page);
  await page.locator('[data-testid="wind-final"]').click();
  await page.locator('dialog[open] [data-testid="confirm-yes"]').click();
  await drain(page);
  await expect(page.locator('[data-testid="ending"]')).toHaveAttribute('data-ending', 'wound');
  await page.screenshot({ path: 'docs/screens/ending-wound.png' });
});
