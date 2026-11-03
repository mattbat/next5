import { expect, test } from '@playwright/test';

/**
 * The Game Day screen must show the five players on court, every IN/OUT
 * pair, and the Next button without any scrolling, at every phone size we
 * support (REQUIREMENTS.md §9). Sizes are the visible area in CSS pixels.
 */
const SIZES = [
  { name: 'iPhone 16 Pro / 17, Home Screen app', width: 402, height: 874 },
  { name: 'iPhone 16 Pro / 17 in Safari with toolbars', width: 402, height: 680 },
  { name: 'iPhone Pro Max, Home Screen app', width: 440, height: 956 },
  { name: 'iPhone SE, Home Screen app', width: 375, height: 667 },
  { name: 'iPhone SE in Safari with toolbars', width: 375, height: 548 },
];

for (const size of SIZES) {
  test.describe(`${size.name} (${size.width}×${size.height})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('Game Day fits on one screen when all five players change', async ({ page }) => {
      await page.goto('./');
      await page.getByRole('button', { name: 'Load demo team' }).click();
      await page.getByRole('radio', { name: 'Games' }).click();
      await page.getByRole('button', { name: '+ New game' }).click();
      await page.getByRole('button', { name: 'Generate plan' }).click();
      await page.getByRole('button', { name: 'Start game' }).click();
      await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();

      const rows = page.getByRole('region', { name: 'On court now' }).getByRole('listitem');
      // The demo team has 10 players, so all five change at the first sub:
      // the worst case for space.
      const subs = page.getByRole('region', { name: 'Next change' }).getByRole('listitem');
      await expect(rows).toHaveCount(5);
      await expect(subs).toHaveCount(5);
      for (let i = 0; i < 5; i++) {
        await expect(rows.nth(i)).toBeInViewport({ ratio: 1 });
        await expect(subs.nth(i)).toBeInViewport({ ratio: 1 });
      }
      await expect(page.getByRole('button', { name: 'Next' })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: '↶ Undo' })).toBeInViewport({ ratio: 1 });

      const scroll = await page.evaluate(() => ({
        vertical: document.documentElement.scrollHeight - window.innerHeight,
        horizontal: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(scroll.vertical, 'page scrolls vertically').toBeLessThanOrEqual(0);
      expect(scroll.horizontal, 'page scrolls sideways').toBeLessThanOrEqual(0);

      // Tap targets stay comfortably large even on the smallest screen.
      const next = await page.getByRole('button', { name: 'Next' }).boundingBox();
      expect(next!.height).toBeGreaterThanOrEqual(56);
      // Next sits at the bottom of the screen, with no empty band below it.
      expect(size.height - (next!.y + next!.height), 'space below Next').toBeLessThanOrEqual(16);
      // Rows may shrink to fit, but names must stay readable.
      const row = await rows.first().boundingBox();
      expect(row!.height).toBeGreaterThanOrEqual(28);
    });
  });
}
