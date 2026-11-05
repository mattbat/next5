import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { createDemoTeam, createGame } from '../data/repo';
import { RELEASES, releaseToShow, SEEN_KEY, seenVersion } from '../data/whatsNew';
import { startGame } from '../domain/game';
import { WhatsNewSheet } from './WhatsNew';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
  window.location.hash = '#/';
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('What’s new (REL3)', () => {
  it('has notes for the version being built', () => {
    expect(RELEASES[0]?.version).toBe(__APP_VERSION__);
  });

  it('counts as seen on a new phone, where the intro covers it', () => {
    expect(releaseToShow(false)).toBeNull();
    expect(seenVersion()).toBe(__APP_VERSION__);
    expect(releaseToShow(true)).toBeNull();
  });

  it('shows once after an update, and not again', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SEEN_KEY, '0.0.1');
    render(<WhatsNewSheet />);
    const sheet = await screen.findByRole('dialog', { name: `What’s new in ${__APP_VERSION__}` });
    const latest = RELEASES[0]!;
    const firstNote = [...(latest.new ?? []), ...(latest.improved ?? []), ...(latest.fixed ?? [])][0]!;
    expect(sheet).toHaveTextContent(firstNote);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(seenVersion()).toBe(__APP_VERSION__);
  });

  it('shows to someone who had the app before notes existed', async () => {
    await createDemoTeam();
    render(<WhatsNewSheet />);
    expect(await screen.findByRole('dialog', { name: /What’s new/ })).toBeInTheDocument();
  });

  it('waits until the game is over', async () => {
    const team = await createDemoTeam();
    const game = await createGame(team);
    await db.games.put({ ...startGame(game), plan: [[]] });
    localStorage.setItem(SEEN_KEY, '0.0.1');
    await goTo(`#/game/${game.id}/live`);
    render(<WhatsNewSheet />);
    await waitFor(() => expect(db.teams.count()).resolves.toBe(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await goTo('#/');
    expect(await screen.findByRole('dialog', { name: /What’s new/ })).toBeInTheDocument();
  });

  it('is listed in Settings, latest first', async () => {
    localStorage.setItem(SEEN_KEY, __APP_VERSION__);
    await goTo('#/settings');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What’s new' })).toBeInTheDocument();
    expect(screen.getByText(RELEASES[0]!.version)).toBeInTheDocument();
  });
});
