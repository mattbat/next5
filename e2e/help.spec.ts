import { expect, test, type Page } from '@playwright/test';

/** The first-run intro and the in-app guide (H-1, H-3) on an iPhone-sized screen. */

// A phone that has never opened next5.
test.use({ storageState: { cookies: [], origins: [] } });

async function expectNoHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide, 'page scrolls sideways').toBe(false);
}

/** Every picture on the page has loaded. */
async function expectImagesLoaded(page: Page) {
  const broken = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')];
    for (const img of imgs) img.loading = 'eager';
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
    return imgs.filter((img) => img.naturalWidth === 0).map((img) => img.src);
  });
  expect(broken).toEqual([]);
}

test('a first-time coach sees the intro, fitting the screen, and can start with the demo team', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Fair subs, one tap at a time' })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    // Each card fits on one screen, with its buttons in reach.
    await expectImagesLoaded(page);
    await expectNoHorizontalScroll(page);
    const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
    expect(fits, `card ${i + 1} fits without scrolling`).toBe(true);
    if (i < 5) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Try the demo team' }).click();
  await expect(page.getByRole('heading', { name: 'Demo Hoopers' })).toBeVisible();

  // It doesn't come back.
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Demo Hoopers/ })).toBeVisible();
});

test('the guide opens from the Teams screen and every topic reads well on a phone', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('link', { name: 'Help' }).click();
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: /Quick start/ }).first().click();
  for (;;) {
    await expect(page.getByRole('article')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectImagesLoaded(page);
    const next = page.getByRole('navigation', { name: 'More help' }).getByRole('link', { name: /Next/ });
    if ((await next.count()) === 0) break;
    await next.click();
  }
  await expect(page.getByRole('heading', { name: 'Questions and troubleshooting' })).toBeVisible();

  // A help link on a screen opens its topic, and Back returns to the screen.
  await page.goto('./#/settings');
  await page.getByRole('link', { name: /About backups/ }).click();
  await expect(page.getByRole('heading', { name: 'Backups and your data' })).toBeVisible();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
