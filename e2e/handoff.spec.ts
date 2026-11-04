import { expect, test, type Page } from '@playwright/test';

/**
 * Two phones (SH1–SH6): the coach plans and texts the game to the assistant,
 * the assistant starts it, makes an injury sub, then has to leave and
 * AirDrops the game in progress back for the coach to finish. Each phone
 * is its own browser context, so they share no data, like two iPhones.
 */

/** The share sheet takes links (Messages); files fall back to a download (AirDrop isn't scriptable). */
async function fakeShareSheet(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { sharedLinks: string[] };
    w.sharedLinks = [];
    Object.assign(navigator, {
      canShare: (data: { files?: File[] }) => !data.files,
      share: async (data: { url?: string }) => {
        if (data.url) w.sharedLinks.push(data.url);
      },
    });
  });
}

const lastLink = (page: Page) => page.evaluate(() => (window as unknown as { sharedLinks: string[] }).sharedLinks.at(-1)!);

test('coach texts a game to the assistant, who starts it and hands it back mid-game', async ({ page: coach, browser, baseURL }) => {
  // Two phones' worth of steps.
  test.setTimeout(90_000);
  await fakeShareSheet(coach);

  // Coach: plan the game and text it.
  await coach.goto('./');
  await coach.getByRole('button', { name: 'Load demo team' }).click();
  await coach.getByRole('button', { name: '+ New game' }).click();
  await coach.getByLabel('Opponent').fill('Rockets');
  await coach.getByRole('button', { name: 'Generate plan' }).click();
  await coach.getByRole('button', { name: 'Share game' }).click();
  await coach.getByRole('button', { name: 'Text a link' }).click();
  await expect(coach.getByRole('status')).toHaveText('Game shared.');
  await expect(coach.getByRole('complementary', { name: 'Shared with the other phone' })).toBeVisible();
  const firstLink = await lastLink(coach);
  expect(firstLink).toContain('/next5/#/receive/');

  // Assistant: a different phone, with nothing on it, opens the link from Messages.
  const assistantContext = await browser.newContext({ baseURL, viewport: { width: 402, height: 874 }, acceptDownloads: true });
  const assistant = await assistantContext.newPage();
  await fakeShareSheet(assistant);
  await assistant.goto(firstLink);
  await expect(assistant.getByRole('heading', { name: 'Shared game' })).toBeVisible();
  await assistant.getByRole('button', { name: 'Open here' }).click();
  await assistant.getByRole('button', { name: 'Start game' }).click();
  await expect(assistant.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();

  // An injury: sub a guard off for the game and accept the re-plan.
  const guard = assistant.getByRole('button', { name: /Guard: change$/ }).first();
  const injured = (await guard.locator('.court-name').textContent())!;
  await guard.click();
  await assistant.getByRole('button', { name: /Injured or leaving/ }).click();
  await assistant.getByRole('dialog', { name: `Who replaces ${injured}?` }).getByRole('list', { name: 'Can play Guard' }).getByRole('button').first().click();
  const anyway = assistant.getByRole('button', { name: 'Swap anyway' });
  const preview = assistant.getByRole('dialog', { name: 'Re-plan the rest of the game' });
  await expect(preview.or(anyway)).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await preview.getByRole('button', { name: 'Use new plan' }).click();
  await assistant.getByRole('button', { name: 'Next' }).click();

  // The coach texts a late plan change; the assistant's started game is protected.
  await coach.getByRole('button', { name: 'Share again' }).click();
  await coach.getByRole('button', { name: 'Text a link' }).click();
  await assistant.goto(await lastLink(coach));
  await expect(assistant.getByRole('alert')).toContainText('You’ve already started this game');
  await assistant.getByRole('button', { name: 'Keep mine' }).click();
  await expect(assistant.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeVisible();

  // Assistant has to leave in Q2: AirDrop the game in progress back (a download here).
  await assistant.getByRole('button', { name: 'Next' }).click();
  await expect(assistant.getByRole('heading', { name: 'Q2 · 1 of 2' })).toBeVisible();
  await assistant.getByRole('button', { name: 'Edit' }).click();
  await assistant.getByRole('button', { name: 'Share game' }).click();
  const downloading = assistant.waitForEvent('download');
  await assistant.getByRole('button', { name: 'AirDrop a file' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^next5-demo-hoopers-game-\d{4}-\d{2}-\d{2}-vs-rockets\.json$/);
  const file = await download.path();
  // The assistant's phone stops running the game.
  await expect(assistant.getByText('The other phone is running this game')).toBeVisible();
  await expect(assistant.getByRole('button', { name: 'Next' })).toHaveCount(0);

  // Coach: open the file from the Teams screen and take over where the assistant left off.
  await coach.goto('./');
  await coach.getByLabel('Game file').setInputFiles(file);
  await expect(coach.getByRole('heading', { name: 'Shared game' })).toBeVisible();
  await expect(coach.getByText(/You take over from Q2 · 1 of 2/)).toBeVisible();
  await coach.getByRole('button', { name: 'Open here' }).click();
  await expect(coach.getByRole('heading', { name: 'Q2 · 1 of 2' })).toBeVisible();
  for (let i = 0; i < 5; i++) await coach.getByRole('button', { name: 'Next' }).click();
  await coach.getByRole('button', { name: 'End game' }).click();
  await expect(coach.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(coach.getByText(/^Segments played out of 8\./)).toBeVisible();
  await expect(coach.getByRole('heading', { name: 'Changes from the plan' })).toBeVisible();
  await expect(coach.getByText(new RegExp(injured))).not.toHaveCount(0);
  await coach.getByRole('link', { name: 'Done' }).click();
  await expect(coach.getByRole('link', { name: /vs Rockets/ })).toContainText('Final');
  // Closing the assistant's phone deletes its download, so it waits until the coach has the file.
  await assistantContext.close();
});
