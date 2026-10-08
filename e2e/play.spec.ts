import { expect, test } from '@playwright/test';
import { playUntilDay, step } from './helpers.js';

test('new game: finish nights 1 and 2 through the UI, resume after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?seed=e2e-one');
  await page.locator('[data-testid="info-ok"]').click();
  await page.locator('[data-testid="new-1"]').click();
  await page.locator('[data-testid="choice-0"]').click();
  await expect(page.locator('[data-testid="tavern"]')).toBeVisible();
  await playUntilDay(page, 1);
  await expect(page.locator('[data-testid="night-report"]')).toContainText('После ночи 1');
  await page.screenshot({ path: 'docs/screens/e2e-day1.png' });
  await page.locator('[data-testid="next-night"]').click();
  await expect(page.locator('.hud-night strong')).toContainText('Ночь 2');
  for (let i = 0; i < 8; i++) await step(page);
  while (await page.locator('dialog[open]').count()) await step(page);
  const tickBefore = await page.locator('.clock-text').textContent();
  await page.reload();
  await page.locator('[data-testid="continue-1"]').click();
  await expect(page.locator('.clock-text')).toHaveText(tickBefore ?? '');
  await page.screenshot({ path: 'docs/screens/e2e-night2-resumed.png' });
  await playUntilDay(page, 2);
  await expect(page.locator('[data-testid="night-report"]')).toContainText('После ночи 2');
  await page.screenshot({ path: 'docs/screens/e2e-day2.png' });
  expect(errors).toEqual([]);
});

