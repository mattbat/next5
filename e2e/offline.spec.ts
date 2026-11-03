import { expect, test } from '@playwright/test';

test('launches and keeps data with no internet after the first visit (T5)', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await expect(page.getByRole('heading', { name: 'Demo Hoopers' })).toBeVisible();

  // Wait until the service worker has cached the app and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Demo Hoopers/ })).toBeVisible();
  await context.setOffline(false);
});
