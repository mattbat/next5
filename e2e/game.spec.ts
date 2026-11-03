import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('plans and runs a full game on an iPhone-sized screen', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Add next5 to your Home Screen')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Try the app with the demo team.
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await expect(page.getByRole('heading', { name: 'Demo Hoopers' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Roster (10)' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Plan a game without one player.
  await page.getByRole('radio', { name: 'Games' }).click();
  await page.getByRole('button', { name: '+ New game' }).click();
  await page.getByLabel('Opponent').fill('Rockets');
  await page.locator('label', { hasText: 'Kai' }).click();
  await expect(page.getByRole('heading', { name: 'Attending (9)' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Generate plan' }).click();

  await expect(page.getByRole('heading', { name: 'vs Rockets' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Kai' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Start game' }).click();

  // Game day: everything needed is visible without scrolling.
  await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeInViewport();
  await expect(page.getByRole('region', { name: 'On court now' }).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Next change' })).toBeInViewport();
  await expectNoHorizontalScroll(page);
  const box = await next.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(60);

  await next.click();
  await expect(page.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeVisible();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Q2 · 1 of 2' })).toBeVisible();
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeVisible();

  // Closing or reloading the app never loses the game (D8).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeVisible();

  for (let i = 0; i < 6; i++) await next.click();
  await expect(page.getByText('This is the final lineup.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'End game' }).click();
  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Segments played out of 8.')).toBeVisible();

  // The finished game is in the team's history.
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('radio', { name: 'Games' }).click();
  await expect(page.getByRole('link', { name: /vs Rockets/ })).toContainText('Final');
});

test('adds a player with positions and skill levels', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('New team name').fill('8U Thunder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: '8U Thunder' })).toBeVisible();

  await page.getByRole('button', { name: '+ Add' }).click();
  const sheet = page.getByRole('dialog', { name: 'New player' });
  await sheet.getByPlaceholder('First name').fill('Maya');
  await sheet.getByLabel('#').fill('7');
  await sheet.getByRole('radiogroup', { name: 'Guard skill' }).getByRole('radio', { name: 'Go-To' }).click();
  await sheet.getByRole('radiogroup', { name: 'Forward skill' }).getByRole('radio', { name: 'Rising' }).click();
  await expectNoHorizontalScroll(page);
  await sheet.getByRole('button', { name: 'Add player' }).click();

  const row = page.getByRole('button', { name: /Maya/ });
  await expect(row).toContainText('7');
  await expect(row).toContainText('G');
  await expect(row).toContainText('F');
});
