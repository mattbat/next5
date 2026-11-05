/**
 * Plan editing through the real screen (REQUIREMENTS.md G6–G9): stepping
 * through segments, locks, swaps, regenerating from a segment, and the grid.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { createDemoTeam, createGame, saveGame, updatePlayer } from '../data/repo';
import type { Game } from '../data/types';
import { planGame, startGame } from '../domain/game';

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

/** A planned demo-team game, open on the Plan screen. */
async function openPlan(options: { onlyCenter?: string; live?: boolean } = {}): Promise<Game> {
  const team = await createDemoTeam();
  if (options.onlyCenter) {
    // Make one player the only center, so swapping them out leaves Center uncovered.
    for (const p of await db.players.toArray()) {
      if (p.name === options.onlyCenter || p.skills.C === undefined) continue;
      const rest = Object.fromEntries(Object.entries(p.skills).filter(([pos]) => pos !== 'C'));
      await updatePlayer(p.id, { skills: Object.keys(rest).length > 0 ? rest : { F: 2 } });
    }
  }
  const roster = await db.players.toArray();
  let game = await createGame(team);
  const outcome = planGame(game, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  game = { ...game, plan: outcome.plan, warnings: outcome.warnings };
  if (options.live) game = startGame(game);
  await saveGame(game);
  await goTo(`#/game/${game.id}/plan`);
  render(<App />);
  await screen.findByRole('heading', { name: 'Q1 · 1 of 2' });
  return game;
}

const savedGame = async (id: string) => (await db.games.get(id))!;
const court = () => within(screen.getByRole('list', { name: 'On court' }));
const bench = () => within(screen.getByRole('list', { name: 'Bench' }));
const courtNames = () =>
  court()
    .getAllByRole('button')
    .map((b) => b.querySelector('.court-name')!.textContent);
const benchNames = () =>
  bench()
    .getAllByRole('button')
    .map((b) => b.querySelector('.court-name')!.textContent);

describe('stepping through segments', () => {
  it('shows each segment’s five and bench, with previous, next and jump buttons', async () => {
    const user = userEvent.setup();
    await openPlan();
    expect(courtNames()).toHaveLength(5);
    expect(benchNames()).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Previous segment' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next segment' }));
    expect(screen.getByRole('heading', { name: 'Q1 · 2 of 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Q4 · 2 of 2' }));
    expect(screen.getByRole('heading', { name: 'Q4 · 2 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next segment' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous segment' }));
    expect(screen.getByRole('heading', { name: 'Q4 · 1 of 2' })).toBeInTheDocument();
  });

  it('opens a segment from the grid', async () => {
    const user = userEvent.setup();
    await openPlan();
    await user.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Q3 · 1 of 2' }));
    expect(screen.getByRole('heading', { name: 'Q3 · 1 of 2' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shares the plan as text from the grid (E2)', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async (data: ShareData) => void data);
    Object.assign(navigator, { share });
    await openPlan();
    await user.click(screen.getByRole('radio', { name: 'Grid' }));
    await user.click(screen.getByRole('button', { name: 'Share plan as text' }));
    expect(share).toHaveBeenCalledWith({ title: 'next5 plan: Game plan', text: expect.stringMatching(/^Demo Hoopers: game/) });
    expect(share.mock.calls[0]![0].text).toMatch(/\nQ4 · 2 of 2: .+\n\nSegments each: /);
    expect(await screen.findByText('Plan shared.')).toBeInTheDocument();
    Object.assign(navigator, { share: undefined });
  });

  it('is read-only once the game has started', async () => {
    await openPlan({ live: true });
    for (const button of court().getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Lock lineup/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to game' })).toBeInTheDocument();
  });
});

describe('locks (G6) and auto-fill (G7)', () => {
  it('locks a player out: someone else comes in, and it can be undone', async () => {
    const user = userEvent.setup();
    const game = await openPlan();
    const before = courtNames();
    const out = before[0]!;
    await user.click(court().getByRole('button', { name: new RegExp(`^${out},`) }));
    await user.click(screen.getByRole('button', { name: /Lock out/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${out} locked out for Q1 · 1 of 2.`));
    expect(courtNames()).not.toContain(out);
    expect(bench().getByRole('button', { name: `${out}, on the bench, locked out` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q1 · 1 of 2, has locks' })).toBeInTheDocument();
    await waitFor(async () => expect((await savedGame(game.id)).locks).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: '↶ Undo' }));
    await waitFor(async () => expect((await savedGame(game.id)).locks).toEqual([]));
    await waitFor(() => expect(courtNames()).toContain(out));
  });

  it('locks a bench player in, then unlocks them', async () => {
    const user = userEvent.setup();
    const game = await openPlan();
    const sitter = benchNames()[0]!;
    await user.click(bench().getByRole('button', { name: new RegExp(`^${sitter},`) }));
    await user.click(screen.getByRole('button', { name: /Lock in/ }));
    expect(await court().findByRole('button', { name: new RegExp(`^${sitter}, .*, locked in$`) })).toBeInTheDocument();

    await user.click(court().getByRole('button', { name: new RegExp(`^${sitter},`) }));
    expect(screen.getByText(/Locked in\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(async () => expect((await savedGame(game.id)).locks).toEqual([]));
    expect(courtNames()).toContain(sitter);
  });

  it('locks and unlocks the whole lineup', async () => {
    const user = userEvent.setup();
    const game = await openPlan();
    await user.click(screen.getByRole('button', { name: '🔒 Lock lineup' }));
    await waitFor(async () => expect((await savedGame(game.id)).locks).toHaveLength(5));
    expect(await court().findAllByText('🔒 In')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Unlock lineup' }));
    await waitFor(async () => expect((await savedGame(game.id)).locks).toEqual([]));
  });

  it('explains a lock that would make the plan impossible and changes nothing', async () => {
    const user = userEvent.setup();
    const game = await openPlan({ onlyCenter: 'Casey' });
    const centerRow = court().queryByRole('button', { name: /^Casey,/ });
    if (!centerRow) await user.click(screen.getByRole('button', { name: 'Next segment' }));
    await user.click(court().getByRole('button', { name: /^Casey,/ }));
    await user.click(screen.getByRole('button', { name: /Lock out/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nobody left can play Center/);
    expect((await savedGame(game.id)).locks).toEqual([]);
  });
});

describe('swap in the plan (G9)', () => {
  it('swaps a bench player in and keeps the swap as locks', async () => {
    const user = userEvent.setup();
    const game = await openPlan();
    const row = court().getAllByRole('button')[0]!;
    const outName = row.querySelector('.court-name')!.textContent!;
    await user.click(row);
    await user.click(screen.getByRole('button', { name: 'Swap with someone on the bench' }));
    // Players who can play the open position are listed first.
    const first = within(screen.getByRole('dialog')).getAllByRole('button').find((b) => b.classList.contains('list-item'))!;
    const inName = first.querySelector('.list-title')!.textContent!;
    await user.click(first);
    const anyway = screen.queryByRole('button', { name: 'Swap anyway' });
    if (anyway) await user.click(anyway);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${inName} in for ${outName} in Q1 · 1 of 2`));
    expect(courtNames()).toContain(inName);
    expect(courtNames()).not.toContain(outName);
    await waitFor(async () =>
      expect((await savedGame(game.id)).locks.map((l) => l.kind).sort()).toEqual(['in', 'out']),
    );
  });

  it('puts a bench player in for someone on the court', async () => {
    const user = userEvent.setup();
    await openPlan();
    const sitter = benchNames()[0]!;
    await user.click(bench().getByRole('button', { name: new RegExp(`^${sitter},`) }));
    await user.click(screen.getByRole('button', { name: 'Put in for someone' }));
    expect(screen.getByRole('dialog', { name: `Who sits for ${sitter}?` })).toBeInTheDocument();
    const dialog = within(screen.getByRole('dialog'));
    // Pick a player who leaves positions covered: try each until the swap is made.
    for (const option of dialog.getAllByRole('button').filter((b) => b.classList.contains('list-item'))) {
      await user.click(option);
      const anyway = screen.queryByRole('button', { name: 'Swap anyway' });
      if (anyway) await user.click(anyway);
      if (!screen.queryByRole('dialog')) break;
    }
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${sitter} in for`));
    expect(courtNames()).toContain(sitter);
  });

  it('blocks a swap that leaves Center uncovered (H1)', async () => {
    const user = userEvent.setup();
    const game = await openPlan({ onlyCenter: 'Casey' });
    if (!court().queryByRole('button', { name: /^Casey,/ })) {
      await user.click(screen.getByRole('button', { name: 'Next segment' }));
    }
    await user.click(court().getByRole('button', { name: /^Casey,/ }));
    await user.click(screen.getByRole('button', { name: 'Swap with someone on the bench' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getAllByRole('button').find((b) => b.classList.contains('list-item'))!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/without the required positions covered/);
    expect((await savedGame(game.id)).locks).toEqual([]);
  });
});

describe('regenerate (G8)', () => {
  it('redoes the lineups from a segment on, keeping earlier ones and locks', async () => {
    const user = userEvent.setup();
    const game = await openPlan();
    await user.click(screen.getByRole('button', { name: 'Q4 · 2 of 2' }));
    await user.click(screen.getByRole('button', { name: '🔒 Lock lineup' }));
    await user.click(screen.getByRole('button', { name: 'Q3 · 1 of 2' }));
    await user.click(screen.getByRole('button', { name: '↻ Redo from here' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('New lineups from Q3 · 1 of 2 on.'));
    const saved = await savedGame(game.id);
    expect(saved.plan.slice(0, 4)).toEqual(game.plan.slice(0, 4));
    const ids = (l: { playerId: string }[]) => l.map((s) => s.playerId).sort();
    expect(ids(saved.plan[7]!)).toEqual(ids(game.plan[7]!));
    expect(saved.seed).toBe(game.seed + 1);
  });

  it('shuffles the whole plan but keeps locks', async () => {
    const user = userEvent.setup();
    const game = await openPlan();
    await user.click(screen.getByRole('button', { name: '🔒 Lock lineup' }));
    await user.click(screen.getByRole('button', { name: '↻ Shuffle' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('New plan made. Locks were kept.'));
    const saved = await savedGame(game.id);
    const ids = (l: { playerId: string }[]) => l.map((s) => s.playerId).sort();
    expect(ids(saved.plan[0]!)).toEqual(ids(game.plan[0]!));
    expect(saved.locks).toHaveLength(5);
  });
});
