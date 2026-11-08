/** Beta (preview) builds of a branch, through the real screens (REL5). */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BetaInfo } from '../../scripts/beta-lib.mjs';
import { db } from '../data/db';
import { createDemoTeam } from '../data/repo';
import { SettingsScreen } from './SettingsScreen';
import { TeamsScreen } from './TeamsScreen';

const build = vi.hoisted(() => ({ beta: null as BetaInfo | null }));
vi.mock('../beta', () => ({
  get BETA() {
    return build.beta;
  },
  versionLabel: () => (build.beta ? `1.2.3 beta · ${build.beta.branch} · abc1234` : '1.2.3'),
}));

const PRACTICE: BetaInfo = { branch: 'claude/practice', next: { new: ['Plan practices.'], fixed: ['A small fix.'] } };

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
  build.beta = PRACTICE;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

describe('a beta build', () => {
  it('is labeled Beta and says which branch it is, with what is coming next', async () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Beta', { selector: '.beta-badge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByText('claude/practice', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.3 beta · claude\/practice · abc1234/)).toBeInTheDocument();
    expect(screen.getByText('Coming next')).toBeInTheDocument();
    expect(screen.getByText('Plan practices.')).toBeInTheDocument();
    expect(screen.getByText('A small fix.')).toBeInTheDocument();
  });

  it('erases its data after offering a backup', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    localStorage.setItem('next5.introSeen', '1');
    localStorage.setItem('other-app', 'kept');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const reload = vi.fn();
    render(<SettingsScreen reload={reload} />);
    await screen.findByText(/Last backup/);
    await waitFor(async () => expect(await db.teams.count()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Erase beta data' }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(await db.teams.count()).toBe(0);
    expect(await db.players.count()).toBe(0);
    expect(localStorage.getItem('next5.introSeen')).toBeNull();
    expect(localStorage.getItem('other-app')).toBe('kept');
  });

  it('erases nothing when the backup it offered is cancelled', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reload = vi.fn();
    render(<SettingsScreen reload={reload} />);
    await waitFor(async () => expect(await db.teams.count()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Erase beta data' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing was erased.');
    expect(reload).not.toHaveBeenCalled();
    expect(await db.teams.count()).toBe(1);
  });

  it('keeps everything when erasing is not confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const reload = vi.fn();
    render(<SettingsScreen reload={reload} />);
    await user.click(screen.getByRole('button', { name: 'Erase beta data' }));
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('the real app', () => {
  it('has no beta label, section or Coming next', async () => {
    build.beta = null;
    const { unmount } = render(<SettingsScreen />);
    expect(screen.queryByRole('heading', { name: 'Beta' })).not.toBeInTheDocument();
    expect(screen.queryByText('Coming next')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Erase beta data' })).not.toBeInTheDocument();
    expect(screen.getByText(/next5 version 1\.2\.3 ·/)).toBeInTheDocument();
    unmount();
    render(<TeamsScreen />);
    expect(document.querySelector('.beta-badge')).toBeNull();
  });
});
