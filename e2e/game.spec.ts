import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** Fails if the page scrolls sideways, naming the elements that stick out. */
async function expectNoHorizontalScroll(page: Page) {
  const offenders = await page.evaluate(() => {
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5)
      .filter((el) => !el.closest('.grid-scroll'))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} → right edge ${Math.round(el.getBoundingClientRect().right)}px`);
  });
  expect(offenders, `Elements wider than the ${page.viewportSize()?.width}px screen`).toEqual([]);
}

test('plans and runs a full game on an iPhone-sized screen', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Add next5 to your Home Screen')).toBeVisible();
  // The add-a-team field is pinned to the bottom of the screen, apart from the list.
  const addTeam = await page.getByLabel('New team name').boundingBox();
  expect(page.viewportSize()!.height - (addTeam!.y + addTeam!.height)).toBeLessThanOrEqual(30);
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

  // Step through the plan one segment at a time, and lock someone out (G6, G7).
  await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();
  const planCourt = page.getByRole('list', { name: 'On court' });
  await expect(planCourt.getByRole('listitem')).toHaveCount(5);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Next segment' }).click();
  await expect(page.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeVisible();
  const lockedOut = (await planCourt.locator('.court-name').first().textContent())!;
  await planCourt.getByRole('button').first().click();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: /Lock out/ }).click();
  await expect(page.getByRole('status')).toContainText(`${lockedOut} locked out for Q1 · 2 of 2.`);
  await expect(planCourt.getByText(lockedOut, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${lockedOut}, on the bench, locked out` })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The grid shows the whole plan, with the lock.
  await page.getByRole('radio', { name: 'Grid' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Kai' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Q1 · 2 of 2: bench, locked out' })).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Start game' }).click();

  // Game day: everything needed is visible without scrolling.
  await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeInViewport();
  await expect(page.getByRole('region', { name: 'On court now' }).getByRole('listitem')).toHaveCount(5);
  // Players are listed Guards, Forwards, Centers, so the order never shuffles.
  const positionsShown = await page.getByRole('region', { name: 'On court now' }).locator('.court-pos').allTextContents();
  const order = ['Guard', 'Forward', 'Center'];
  expect(positionsShown.map((p) => order.indexOf(p))).toEqual([...positionsShown.map((p) => order.indexOf(p))].sort());
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
  await expect(page.getByText(/^Segments played out of 8\./)).toBeVisible();
  // Per-game stats (S3): one row per player who was there.
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(10);
  await expectNoHorizontalScroll(page);

  // Done goes back to the team's games, where the finished game is in its history.
  await page.getByRole('link', { name: 'Done' }).click();
  await page.getByRole('radio', { name: 'Games' }).click();
  await expect(page.getByRole('link', { name: /vs Rockets/ })).toContainText('Final');
  // Opening it shows its stats summary again (S2, S3).
  await page.getByRole('link', { name: /vs Rockets/ }).click();
  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(10);
  await page.getByRole('link', { name: 'Back' }).click();

  // Season stats (S4): every player, including Kai who missed the game.
  await page.getByRole('radio', { name: 'Stats' }).click();
  await expect(page.getByText('From 1 finished game.')).toBeVisible();
  await expect(page.getByRole('row', { name: /^Kai/ })).toContainText('0');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(11);
  await expectNoHorizontalScroll(page);
});

test('adds a player with positions and skill levels', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('New team name').fill('8U Thunder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: '8U Thunder' })).toBeVisible();
  // Teams open on Games; a new team points to the Roster tab.
  await expect(page.getByText(/No players yet/)).toBeVisible();
  await page.getByRole('radio', { name: /^Roster/ }).click();

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

test('handles an injury, re-plans, and goes to overtime', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await page.getByRole('button', { name: '+ New game' }).click();
  await page.getByRole('button', { name: 'Generate plan' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();

  // A guard gets hurt: sub them off for the game with a guard from the bench.
  const guard = page.getByRole('button', { name: /Guard: change$/ }).first();
  const injured = (await guard.locator('.court-name').textContent())!;
  await guard.click();
  await page.getByRole('button', { name: /Injured or leaving/ }).click();
  const chooser = page.getByRole('dialog', { name: `Who replaces ${injured}?` });
  const preview = page.getByRole('dialog', { name: 'Re-plan the rest of the game' });
  // Players who can play the open spot are listed first, with their positions.
  await expect(chooser.getByRole('list', { name: 'Can play Guard' })).toBeVisible();
  await chooser.getByRole('list', { name: 'Can play Guard' }).getByRole('button').first().click();
  // A swap may break a scheduling rule: that's a warning, never a block.
  const anyway = page.getByRole('button', { name: 'Swap anyway' });
  await expect(preview.or(anyway)).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: 'Use new plan' }).click();
  await expect(preview).toBeHidden();
  await expect(page.getByRole('region', { name: 'On court now' })).not.toContainText(injured);

  // Play to the end, then add overtime.
  const next = page.getByRole('button', { name: 'Next' });
  for (let i = 0; i < 7; i++) await next.click();
  await page.getByRole('button', { name: '+ OT' }).click();
  await expect(page.getByRole('heading', { name: 'Next: OT1' })).toBeVisible();
  await next.click();
  await expect(page.getByRole('heading', { name: 'OT1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'On court now' })).not.toContainText(injured);
  await page.getByRole('button', { name: 'End game' }).click();
  await expect(page.getByRole('heading', { name: 'Changes from the plan' })).toBeVisible();
  await expect(page.getByText(/added 1 overtime segment/)).toBeVisible();
});

test('switches to the light theme, which lasts after reopening (D10)', async ({ page }) => {
  await page.goto('./');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await background()).toBe('rgb(11, 15, 23)');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  expect(await background()).toBe('rgb(244, 246, 250)');
  await expectNoHorizontalScroll(page);

  // The theme is set before the app loads, so reopening never flashes dark.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#f4f6fa');
  expect(await background()).toBe('rgb(244, 246, 250)');
});

test('archives a team and brings it back (M1)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await page.getByRole('radio', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Archive team' }).click();

  await expect(page.getByText('All your teams are archived.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Show archived teams (1)' }).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole('list', { name: 'Archived teams' }).getByRole('link', { name: /Demo Hoopers/ }).click();
  await expect(page.getByRole('complementary', { name: 'Archived team' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Unarchive' }).click();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: /Demo Hoopers/ })).toBeVisible();
});
