import { expect, test, type Page } from '@playwright/test';

/**
 * Practice planning on an iPhone-sized screen (PR1–PR10): starter drills, a
 * plan with stations, balanced teams, the timer and the review. Also checks
 * every practice screen fits a narrow phone with a wide font, like
 * wide-font.spec.ts does for the rest of the app.
 */

const WIDE_FONT = 'body, button, a, input, textarea { font-family: Verdana, "DejaVu Sans", sans-serif !important; }';

async function expectFits(page: Page, screen: string) {
  await page.addStyleTag({ content: WIDE_FONT });
  const offenders = await page.evaluate(() => {
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5 && !el.closest('.grid-scroll, .tag-picker.scroll'))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} → ${Math.round(el.getBoundingClientRect().right)}px`);
  });
  expect(offenders, `${screen}: elements wider than the screen`).toEqual([]);
}

test.use({ viewport: { width: 375, height: 667 } });

test('plans, runs and reviews a practice on a narrow phone', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await page.getByRole('radio', { name: 'Practice' }).click();
  await expectFits(page, 'Team: Practice (empty)');

  await page.getByRole('link', { name: 'Drill library' }).click();
  await page.getByRole('button', { name: 'Add starter drills' }).click();
  await expect(page.getByRole('status')).toContainText('starter drills');
  await expectFits(page, 'Drill library');
  await page.getByRole('button', { name: /Shell drill/ }).click();
  await expectFits(page, 'Drill editor');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('link', { name: 'Back' }).click();

  await page.getByRole('button', { name: '+ New practice' }).click();
  for (const drill of ['Dynamic warm-up', 'Closeouts', 'Scrimmage']) {
    await page.getByRole('button', { name: '+ Add drill' }).click();
    if (drill === 'Dynamic warm-up') await expectFits(page, 'Drill picker');
    await page.getByRole('button', { name: `Add ${drill}` }).click();
  }
  const second = page.getByRole('listitem', { name: 'Block 2' });
  await second.getByRole('button', { name: '+ Station' }).click();
  await page.getByRole('button', { name: 'Add Form shooting' }).click();
  await second.getByLabel('Coach for Form shooting').fill('Coach Alexandria');
  await second.getByLabel('Coach for Closeouts').fill('Coach Sam');
  await page.getByRole('button', { name: 'Balanced' }).click();
  await expect(page.getByRole('heading', { name: 'Team A (5)' })).toBeVisible();
  await expect(page.getByText('31 of 75 min')).toBeVisible();
  await expectFits(page, 'Practice plan');

  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByRole('heading', { name: 'Block 1 of 3' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^(8:00|7:5\d)$/);
  await expectFits(page, 'Run practice');
  await page.getByRole('button', { name: 'Went well' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Block 2 of 3' })).toBeVisible();
  await expect(page.getByText('Coach Alexandria · Everyone · Half court')).toBeVisible();
  await expectFits(page, 'Run practice: stations');

  // The timer keeps going if the app is closed and reopened.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Block 2 of 3' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^7:\d\d$/);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByRole('heading', { name: 'Practice review' })).toBeVisible();
  await page.getByLabel('What went well').fill('Sharp closeouts');
  await expectFits(page, 'Practice review');

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('table', { name: 'Time by drill' })).toBeVisible();
  await expectFits(page, 'Team: Practice (with stats)');
  await page.getByRole('radio', { name: 'Settings' }).click();
  await expect(page.getByLabel('Always bring')).toBeVisible();
  await expectFits(page, 'Team: Settings');
});
