/** Backup, restore and the backup reminder through the real screens (B1–B4). */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createBackup, lastBackupAt, markBackedUp } from '../data/backup';
import { db } from '../data/db';
import { createDemoTeam, createTeam } from '../data/repo';

const shared: { name: string; text: string }[] = [];

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
  shared.length = 0;
  // Pretend to be an iPhone: files go to the share sheet.
  Object.assign(navigator, {
    canShare: () => true,
    share: vi.fn(async ({ files }: { files: File[] }) => {
      shared.push({ name: files[0]!.name, text: await files[0]!.text() });
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function backupFile(text: string, name = 'next5-backup.json') {
  return new File([text], name, { type: 'application/json' });
}

describe('Settings: back up', () => {
  it('backs up every team through the share sheet and records when', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    await goTo('#/settings');
    render(<App />);
    expect(await screen.findByText('Last backup: Never')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up all teams' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Backup ready/);
    expect(shared[0]!.name).toMatch(/^next5-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(shared[0]!.text).teams).toHaveLength(1);
    expect(lastBackupAt()).not.toBeNull();
    expect(screen.queryByText('Last backup: Never')).not.toBeInTheDocument();
  });

  it('says so when the share sheet is closed without saving', async () => {
    const user = userEvent.setup();
    Object.assign(navigator, {
      share: async () => {
        throw new DOMException('closed', 'AbortError');
      },
    });
    await goTo('#/settings');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Back up all teams' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup cancelled.');
    expect(lastBackupAt()).toBeNull();
  });

  it('backs up a single team from its Settings tab', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await createTeam('Other team');
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Back up this team' }));
    await waitFor(() => expect(shared).toHaveLength(1));
    expect(shared[0]!.name).toMatch(/^next5-demo-hoopers-/);
    expect(JSON.parse(shared[0]!.text).teams.map((t: { name: string }) => t.name)).toEqual(['Demo Hoopers']);
  });
});

describe('Settings: restore', () => {
  it('replaces everything after confirming', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await createDemoTeam();
    const text = JSON.stringify(await createBackup());
    await db.teams.clear();
    await createTeam('Made later');
    await goTo('#/settings');
    render(<App />);
    await user.upload(await screen.findByLabelText('Backup file'), backupFile(text));
    expect(await screen.findByText(/Demo Hoopers/)).toBeInTheDocument();
    expect(screen.getByText(/10 players/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace everything' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Everything on this phone now matches the backup/);
    expect((await db.teams.toArray()).map((t) => t.name)).toEqual(['Demo Hoopers']);
  });

  it('does nothing if replacing is not confirmed, and can be cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await createDemoTeam();
    const text = JSON.stringify(await createBackup());
    await goTo('#/settings');
    render(<App />);
    await user.upload(await screen.findByLabelText('Backup file'), backupFile(text));
    await user.click(await screen.findByRole('button', { name: 'Replace everything' }));
    expect(await db.teams.count()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Restore from a backup file' })).toBeInTheDocument();
  });

  it('merges a backup into what is on the phone', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    const text = JSON.stringify(await createBackup());
    await db.teams.clear();
    await createTeam('Made later');
    await goTo('#/settings');
    render(<App />);
    await user.upload(await screen.findByLabelText('Backup file'), backupFile(text));
    await user.click(await screen.findByRole('button', { name: 'Merge into this phone' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Merged: 1 item added, 0 items updated/);
    expect((await db.teams.toArray()).map((t) => t.name).sort()).toEqual(['Demo Hoopers', 'Made later']);
  });

  it('explains a file that is not a backup, and changes nothing', async () => {
    const user = userEvent.setup();
    await createTeam('Keep me');
    await goTo('#/settings');
    render(<App />);
    await user.upload(await screen.findByLabelText('Backup file'), backupFile('{"photos":[]}', 'photos.json'));
    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a next5 backup.");
    expect(await db.teams.count()).toBe(1);
  });
});

describe('Settings: updates', () => {
  it('checks for a new version', async () => {
    const user = userEvent.setup();
    const update = vi.fn(async () => {});
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: async () => ({ update, waiting: null, installing: null }) },
      configurable: true,
    });
    await goTo('#/settings');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Check for updates' }));
    expect(update).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/Checked for updates/);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: async () => ({ update, waiting: {}, installing: null }) },
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/A new version is downloading/);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: async () => Promise.reject(new Error('offline')) },
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t check for updates/);
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('shows the version and Diagnostics in Settings, not on the Teams screen', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    markBackedUp();
    await goTo('#/');
    render(<App />);
    await screen.findByRole('heading', { name: 'Teams' });
    expect(screen.queryByText(/version/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everything is saved on this phone/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Diagnostics' })).not.toBeInTheDocument();

    await goTo('#/settings');
    expect(await screen.findByText(new RegExp(`next5 version ${__APP_VERSION__}`))).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Diagnostics' }));
    expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '#/settings');
  });
});

describe('Teams screen backup reminder', () => {
  it('reminds once there is a team, backs up from the reminder, then hides it', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    await goTo('#/');
    render(<App />);
    const reminder = await screen.findByRole('complementary', { name: 'Back up your teams' });
    expect(reminder).toHaveTextContent(/saved only on this phone/);
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Backup ready/);
    expect(screen.queryByRole('complementary', { name: 'Back up your teams' })).not.toBeInTheDocument();
    expect(shared).toHaveLength(1);
  });

  it('can be put off for a week, and stays away after a recent backup', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    await goTo('#/');
    const { unmount } = render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('complementary', { name: 'Back up your teams' })).not.toBeInTheDocument();
    unmount();
    localStorage.clear();
    markBackedUp();
    render(<App />);
    expect(await screen.findByRole('link', { name: /Demo Hoopers/ })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Back up your teams' })).not.toBeInTheDocument();
  });

  it('mentions an old backup when it has been over a month', async () => {
    await createDemoTeam();
    markBackedUp(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await goTo('#/');
    render(<App />);
    expect(await screen.findByText(/over a month since your last backup/)).toBeInTheDocument();
  });
});

describe('Settings: appearance (D10)', () => {
  it('switches between dark and light, and remembers it', async () => {
    const user = userEvent.setup();
    await goTo('#/settings');
    render(<App />);
    const group = await screen.findByRole('radiogroup', { name: 'Appearance' });
    expect(within(group).getByRole('radio', { name: 'Dark' })).toBeChecked();

    await user.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('next5.theme')).toBe('light');
    expect(within(group).getByRole('radio', { name: 'Light' })).toBeChecked();

    await user.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
