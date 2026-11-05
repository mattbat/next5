import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { SHOTS, type ShotName } from '../../src/help/shots';

/**
 * Takes the help screenshots (H-1, H-3): `npm run screenshots`.
 * Walks the demo team (made-up players) through a game in each theme and
 * saves public/help/<name>-<theme>.webp. Run it again whenever a screen
 * changes, and commit the images.
 */

// SHOTS_OUT=<folder> saves PNGs there instead, to look at a change before
// replacing the committed images.
const PREVIEW = process.env.SHOTS_OUT;
const OUT = PREVIEW ?? 'public/help';
mkdirSync(OUT, { recursive: true });

for (const theme of ['dark', 'light'] as const) {
  test(`help screenshots (${theme})`, async ({ page, browser, baseURL }) => {
    test.setTimeout(120_000);
    const taken = new Set<ShotName>();
    const shot = async (name: ShotName, on = page) => {
      // Let sheets finish sliding up.
      await on.waitForTimeout(350);
      const png = await on.screenshot({ animations: 'disabled' });
      if (PREVIEW) await sharp(png).png().toFile(`${OUT}/${name}-${theme}.png`);
      else await sharp(png).webp({ quality: 70 }).toFile(`${OUT}/${name}-${theme}.webp`);
      taken.add(name);
    };

    await page.addInitScript((theme) => {
      if (!sessionStorage.getItem('shots.ready')) {
        sessionStorage.setItem('shots.ready', '1');
        localStorage.setItem('next5.theme', theme);
        localStorage.setItem('next5.installHintDismissed', '1');
        localStorage.setItem('next5.introSeen', '1');
        localStorage.setItem('next5.lastBackupAt', String(Date.now()));
      }
      // The share sheet takes links, so a shared game can be opened below.
      const w = window as unknown as { sharedLinks: string[] };
      w.sharedLinks = [];
      Object.assign(navigator, {
        canShare: (data: { files?: File[] }) => !data.files,
        share: async (data: { url?: string }) => {
          if (data.url) w.sharedLinks.push(data.url);
        },
      });
    }, theme);

    await page.goto('./');
    await page.getByRole('button', { name: 'Load demo team' }).click();
    await expect(page.getByRole('heading', { name: 'Demo Hoopers' })).toBeVisible();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('link', { name: /Demo Hoopers/ })).toBeVisible();
    await shot('teams');

    await page.getByRole('link', { name: /Demo Hoopers/ }).click();
    await page.getByRole('radio', { name: /Roster/ }).click();
    await shot('roster');
    await page.getByRole('button', { name: /Avery/ }).click();
    await shot('player');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('radio', { name: 'Settings' }).click();
    await shot('team-settings');

    await page.getByRole('radio', { name: 'Games' }).click();
    await page.getByRole('button', { name: '+ New game' }).click();
    await page.getByLabel('Opponent').fill('Rockets');
    await page.getByLabel('Opponent').blur();
    await page.locator('label', { hasText: 'Kai' }).click();
    await expect(page.getByRole('heading', { name: 'Attending (9)' })).toBeVisible();
    await shot('setup');
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await expect(page.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeVisible();
    await shot('plan');

    await page.getByRole('button', { name: 'Next segment' }).click();
    await page.getByRole('list', { name: 'On court' }).getByRole('button').first().click();
    await shot('plan-player');
    await page.getByRole('button', { name: /Lock out/ }).click();
    await expect(page.getByRole('status')).toContainText('locked out');
    await shot('plan-notice');
    await page.getByRole('radio', { name: 'Grid' }).click();
    await shot('plan-grid');
    await page.getByRole('radio', { name: 'Segments' }).click();

    await page.getByRole('button', { name: 'Share game' }).click();
    await shot('share');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Start game' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeVisible();
    await shot('gameday');
    await page.getByRole('region', { name: 'On court now' }).getByRole('button').first().click();
    await shot('gameday-player');
    await page.getByRole('button', { name: '1 segment', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Re-plan the rest of the game' })).toBeVisible();
    await shot('replan');
    await page.getByRole('button', { name: 'Use new plan' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await shot('gameday-menu');
    await page.getByRole('button', { name: 'Done' }).click();

    const next = page.getByRole('button', { name: 'Next', exact: true });
    for (let i = 0; i < 6; i++) await next.click();
    await expect(page.getByText('This is the final lineup.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'End game' }).click();
    await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
    await shot('final');

    // Share the finished game, then open the link as the other phone would.
    await page.getByRole('button', { name: 'Share game' }).click();
    await page.getByRole('button', { name: 'Text a link' }).click();
    await expect(page.getByRole('status')).toHaveText('Game shared.');
    const link = await page.evaluate(() => (window as unknown as { sharedLinks: string[] }).sharedLinks.at(-1)!);

    await page.getByRole('link', { name: 'Done' }).click();
    await page.getByRole('radio', { name: 'Stats' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await shot('stats');

    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await shot('settings');

    // The other phone, with nothing on it yet.
    const other = await browser.newContext({ ...test.info().project.use, baseURL });
    const phone = await other.newPage();
    await phone.addInitScript((theme) => localStorage.setItem('next5.theme', theme), theme);
    await phone.goto(link);
    await expect(phone.getByRole('heading', { name: 'Shared game' })).toBeVisible();
    await shot('receive', phone);
    await other.close();

    expect([...taken].sort()).toEqual(Object.keys(SHOTS).sort());
  });
}
