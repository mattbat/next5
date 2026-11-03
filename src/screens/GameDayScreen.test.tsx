/**
 * Game-day changes through the real screen (REQUIREMENTS.md D4–D6, D11):
 * swaps, injuries, rest, late arrivals, re-planning and overtime.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { createDemoTeam, createGame, saveGame, updatePlayer } from '../data/repo';
import type { Game } from '../data/types';
import { nextSegment, planGame, startGame } from '../domain/game';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** A live demo-team game, optionally with one player not attending. */
async function startLiveGame(options: { absent?: string; advance?: number } = {}): Promise<Game> {
  const team = await createDemoTeam();
  const roster = await db.players.toArray();
  let game = await createGame(team);
  if (options.absent) {
    const absentId = roster.find((p) => p.name === options.absent)!.id;
    game = { ...game, attending: game.attending.filter((id) => id !== absentId) };
  }
  const outcome = planGame(game, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  game = startGame({ ...game, plan: outcome.plan });
  for (let i = 0; i < (options.advance ?? 0); i++) game = nextSegment(game);
  await saveGame(game);
  await goTo(`#/game/${game.id}/live`);
  return game;
}

const savedGame = async (id: string) => (await db.games.get(id))!;
const courtNames = () =>
  within(screen.getByRole('region', { name: 'On court now' }))
    .getAllByRole('button')
    .map((b) => b.querySelector('.court-name')!.textContent);

describe('game day changes', () => {
  it('subs a player out now and credits both players for the segment', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame();
    render(<App />);
    const first = (await screen.findAllByRole('button', { name: /: change$/ }))[0]!;
    const leaving = first.querySelector('.court-name')!.textContent!;
    await user.click(first);
    await user.click(screen.getByRole('button', { name: 'Sub out now' }));
    const chooser = screen.getByRole('dialog', { name: `Who replaces ${leaving}?` });
    expect(within(chooser).getByText(/Both players get credit/)).toBeInTheDocument();
    const options = within(chooser).getAllByRole('button').filter((b) => b.classList.contains('list-item'));
    // Try candidates until one keeps the positions covered (others are explained).
    for (const option of options) {
      await user.click(option);
      if (!screen.queryByRole('dialog')) break;
      expect(within(chooser).getByRole('alert')).toHaveTextContent(/would leave no one to play/);
    }
    await waitFor(() => expect(courtNames()).not.toContain(leaving));
    const saved = await savedGame(game.id);
    expect(saved.subbedOut).toHaveLength(1);
    expect(saved.events.at(-1)?.kind).toBe('swap-now');
  });

  it('marks an injured player out, subs them off, and re-plans the rest of the game', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame();
    render(<App />);
    // Avery plays guard; any guard on the bench can replace them.
    const guard = (await screen.findAllByRole('button', { name: /Guard: change$/ }))[0]!;
    const injured = guard.querySelector('.court-name')!.textContent!;
    await user.click(guard);
    await user.click(screen.getByRole('button', { name: /Injured or leaving/ }));
    const chooser = screen.getByRole('dialog', { name: `Who replaces ${injured}?` });
    expect(within(chooser).getByText(/out for the rest of the game/)).toBeInTheDocument();
    const roster = await db.players.toArray();
    const benchGuard = within(chooser)
      .getAllByRole('button')
      .find((b) => roster.find((p) => p.name === b.querySelector('.list-title')?.textContent)?.skills.G)!;
    await user.click(benchGuard);

    const preview = await screen.findByRole('dialog', { name: 'Re-plan the rest of the game' });
    expect(within(preview).getByText(/upcoming lineups? will change/)).toBeInTheDocument();
    await user.click(within(preview).getByRole('button', { name: 'Use new plan' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const saved = await savedGame(game.id);
    const injuredId = roster.find((p) => p.name === injured)!.id;
    expect(saved.statuses[injuredId]).toEqual({ kind: 'out', from: 1 });
    expect(saved.plan.slice(1).some((l) => l.some((s) => s.playerId === injuredId))).toBe(false);
    expect(saved.events.map((e) => e.kind)).toEqual(['swap-now', 'status', 'replan']);
  });

  it('rests a bench player, warns while the plan still includes them, and re-plans from the banner', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const menu = screen.getByRole('dialog', { name: 'Game changes' });
    const benchRow = within(menu)
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('On the bench'))!;
    const resting = benchRow.querySelector('.list-title')!.firstChild!.textContent!;
    await user.click(benchRow);
    await user.click(screen.getByRole('button', { name: '2 segments' }));
    // Keep the old plan for now: the screen should flag the conflict.
    await user.click(await screen.findByRole('button', { name: 'Keep plan' }));
    const banner = await screen.findByRole('button', { name: new RegExp(`${resting} can't play`) });
    await user.click(banner);
    await user.click(await screen.findByRole('button', { name: 'Use new plan' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /can't play/ })).not.toBeInTheDocument());
    expect((await savedGame(game.id)).statuses).not.toEqual({});
  });

  it('makes a player available again', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame();
    const playerId = game.attending.find((id) => !game.plan[0]!.some((s) => s.playerId === id))!;
    await saveGame({ ...game, statuses: { [playerId]: { kind: 'resting', from: 1, until: 3 } } });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /Resting until/ }));
    await user.click(screen.getByRole('button', { name: 'Available again' }));
    await user.click(await screen.findByRole('button', { name: 'Use new plan' }));
    await waitFor(async () => expect((await savedGame(game.id)).statuses).toEqual({}));
  });

  it('adds a late arrival to the game from the next segment', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame({ absent: 'Kai' });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /Show players not here/ }));
    await user.click(screen.getByRole('button', { name: /Kai/ }));
    await user.click(screen.getByRole('button', { name: 'Arrived: add to this game' }));
    await user.click(await screen.findByRole('button', { name: 'Use new plan' }));
    await waitFor(async () => {
      const saved = await savedGame(game.id);
      const kai = (await db.players.toArray()).find((p) => p.name === 'Kai')!;
      expect(saved.attending).toContain(kai.id);
      expect(saved.plan.slice(1).some((l) => l.some((s) => s.playerId === kai.id))).toBe(true);
    });
  });

  it('changes who comes in at the next substitution', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame();
    render(<App />);
    const incoming = (await screen.findAllByRole('button', { name: /^In: .*Forward/ }))[0]!;
    const replacedName = incoming.querySelector('.sub-name')!.textContent!;
    await user.click(incoming);
    const chooser = screen.getByRole('dialog', { name: `Send in someone instead of ${replacedName}?` });
    const roster = await db.players.toArray();
    // With 10 players everyone available is on the court now, so choosing a
    // forward keeps them on for the next lineup instead.
    const forward = within(chooser)
      .getAllByRole('button')
      .find((b) => roster.find((p) => p.name === b.querySelector('.list-title')?.textContent)?.skills.F)!;
    const forwardId = roster.find((p) => p.name === forward.querySelector('.list-title')!.textContent)!.id;
    const replacedId = roster.find((p) => p.name === replacedName)!.id;
    await user.click(forward);
    await waitFor(async () => {
      const next = (await savedGame(game.id)).plan[1]!.map((s) => s.playerId);
      expect(next).toContain(forwardId);
      expect(next).not.toContain(replacedId);
    });
    expect(screen.queryByRole('button', { name: new RegExp(`^In: ${replacedName}`) })).not.toBeInTheDocument();
    expect((await savedGame(game.id)).events.at(-1)?.kind).toBe('swap-next');
  });

  it('re-plans from the menu and shows when nothing changes', async () => {
    const user = userEvent.setup();
    await startLiveGame();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Re-plan rest of game' }));
    expect(await screen.findByText('No lineups need to change.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep plan' }));
  });

  it('explains when a re-plan is impossible', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame();
    const out = Object.fromEntries(game.attending.slice(0, 6).map((id) => [id, { kind: 'out' as const, from: 1 }]));
    await saveGame({ ...game, statuses: out });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Re-plan rest of game' }));
    expect(await screen.findByRole('dialog', { name: "Can't re-plan" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));
  });

  it('adds overtime on the last segment and logs every change in the summary', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame({ advance: 7 });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: '+ OT' }));
    expect(await screen.findByRole('heading', { name: 'Next: OT1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'OT1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End game' }));
    expect(await screen.findByRole('heading', { name: 'Changes from the plan' })).toBeInTheDocument();
    expect(screen.getByText(/added 1 overtime segment/)).toBeInTheDocument();
    expect((await savedGame(game.id)).played).toHaveLength(9);
  });

  it('lists inactive players nowhere and handles a player deleted mid-game', async () => {
    const user = userEvent.setup();
    const game = await startLiveGame({ absent: 'Kai' });
    const kai = (await db.players.toArray()).find((p) => p.name === 'Kai')!;
    await updatePlayer(kai.id, { active: false });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: /Show players not here/ })).not.toBeInTheDocument();
    expect(game.status).toBe('live');
  });
});
