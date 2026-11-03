import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('backs up, loses everything, and restores it from the backup file (B1, B2)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo team' }).click();
  await page.getByRole('button', { name: '+ New game' }).click();
  await page.getByLabel('Opponent').fill('Rockets');
  await page.getByRole('button', { name: 'Generate plan' }).click();
  await expect(page.getByRole('heading', { name: 'vs Rockets' })).toBeVisible();

  // Back up from Settings. Desktop WebKit can't share files, so it downloads.
  await page.goto('./#/settings');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up all teams' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^next5-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const backup = JSON.parse(await readFile(file, 'utf8'));
  expect(backup.teams).toHaveLength(1);
  expect(backup.games).toHaveLength(1);

  // Lose everything.
  await page.goto('./');
  await page.getByRole('link', { name: /Demo Hoopers/ }).click();
  await page.getByRole('radio', { name: 'Settings' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete team' }).click();
  await expect(page.getByText(/No teams yet/)).toBeVisible();

  // Restore from the file.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Backup file').setInputFiles(file);
  await expect(page.getByText(/1 team/)).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await expect(page.getByRole('status')).toContainText('Everything on this phone now matches the backup');

  // The team, its roster and its game are all back.
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Demo Hoopers/ }).click();
  await expect(page.getByRole('link', { name: /vs Rockets/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Roster (10)' })).toBeVisible();
});
