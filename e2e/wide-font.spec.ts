import { expect, test, type Page } from '@playwright/test';

/**
 * Text is wider in some fonts than others (Linux's fonts are wider than
 * Windows', and iPhone's differ again), so a layout that fits on one machine
 * can stick out on another. This walks every screen at the narrowest phone
 * width we support with a deliberately wide font and checks nothing makes the
 * page scroll sideways.
 */
test.use({ viewport: { width: 375, height: 667 } });

const WIDE_FONT = 'body, button, a, input { font-family: Verdana, "DejaVu Sans", sans-serif !important; }';

async function expectFits(page: Page, screen: string) {
  await page.addStyleTag({ content: WIDE_FONT });
  const offenders = await page.evaluate(() => {
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5 && !el.closest('.grid-scroll'))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} → ${Math.round(el.getBoundingClientRect().right)}px`);
  });
  expect(offenders, `${screen}: elements wider than the screen`).toEqual([]);
}

test('every screen fits a narrow phone even with a wide font', async ({ page }) => {
  await page.goto('./');
  await expectFits(page, 'Teams (empty)');
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await expect(page.getByRole('heading', { name: 'Demo Hoopers' })).toBeVisible();
  await expectFits(page, 'Team: Games');
  await page.getByRole('radio', { name: /^Roster/ }).click();
  await expectFits(page, 'Team: Roster');
  await page.getByRole('button', { name: /Avery/ }).click();
  await expectFits(page, 'Player editor');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('radio', { name: 'Settings' }).click();
  await expectFits(page, 'Team: Settings');

  await page.getByRole('radio', { name: 'Games' }).click();
  await page.getByRole('button', { name: '+ New game' }).click();
  await page.getByLabel('Opponent').fill('Thunderbolts of Springfield');
  await expectFits(page, 'Game setup');
  await page.getByRole('button', { name: 'Generate plan' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expectFits(page, 'Plan');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();
  await expectFits(page, 'Game Day');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expectFits(page, 'Game changes menu');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /: change$/ }).first().click();
  await page.getByRole('button', { name: 'Sub out now' }).click();
  await expectFits(page, 'Sub chooser');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('./');
  await expectFits(page, 'Teams (with backup reminder)');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expectFits(page, 'Settings');
  await page.getByRole('link', { name: 'Diagnostics' }).click();
  await expectFits(page, 'Diagnostics');
});
