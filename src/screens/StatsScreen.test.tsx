/** Game and season stats and CSV export through the real screens (S3–S5). */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { createDemoTeam, createGame, saveGame } from '../data/repo';
import type { Game } from '../data/types';
import { nextSegment, planGame, startGame } from '../domain/game';

const shared: { name: string; type: string; text: string }[] = [];

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
  shared.length = 0;
  // Pretend to be an iPhone: files go to the share sheet.
  Object.assign(navigator, {
    canShare: () => true,
    share: vi.fn(async ({ files }: { files: File[] }) => {
      shared.push({ name: files[0]!.name, type: files[0]!.type, text: await files[0]!.text() });
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

/** A demo-team game played to the end, with one player absent. */
async function finishedGame(): Promise<Game> {
  const team = await createDemoTeam();
  const roster = await db.players.toArray();
  const kai = roster.find((p) => p.name === 'Kai')!.id;
  let game = await createGame(team);
  game = { ...game, opponent: 'Rockets', attending: game.attending.filter((id) => id !== kai) };
  const outcome = planGame(game, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  game = startGame({ ...game, plan: outcome.plan });
  while (game.status === 'live') game = nextSegment(game);
  await saveGame(game);
  return game;
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

describe('per-game stats (S3)', () => {
  it('shows planned, played and sat segments and positions for each player', async () => {
    const game = await finishedGame();
    await goTo(`#/game/${game.id}/live`);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Final' })).toBeInTheDocument();
    expect(rows()).toHaveLength(9);
    for (const row of rows()) {
      const [planned, played, sat, positions] = cells(row);
      // 9 players × 8 segments: everyone plays 4 or 5 and sits the rest.
      expect(Number(played) + Number(sat)).toBe(8);
      expect(planned).toBe(played);
      // Position chips with counts, e.g. [G] 3 [F] 1, read as "Guard 3 Forward 1".
      expect(positions).toMatch(/^([GFC](Guard|Forward|Center) \d)+$/);
    }
  });

  it("opens from the team's Games list", async () => {
    const user = userEvent.setup();
    const game = await finishedGame();
    await goTo(`#/team/${game.teamId}`);
    render(<App />);
    await user.click(await screen.findByRole('link', { name: /vs Rockets/ }));
    await goTo(window.location.hash);
    expect(await screen.findByRole('heading', { name: 'Final' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/game/${game.id}/live`);
    expect(rows()).toHaveLength(9);
  });

  it('goes back to the Games list with Done', async () => {
    const user = userEvent.setup();
    const game = await finishedGame();
    await goTo(`#/game/${game.id}/live`);
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'Done' }));
    await goTo(window.location.hash);
    expect(window.location.hash).toBe(`#/team/${game.teamId}`);
    expect(await screen.findByRole('link', { name: /vs Rockets/ })).toHaveTextContent('Final');
  });

  it('exports the game as CSV through the share sheet (S5)', async () => {
    const user = userEvent.setup();
    const game = await finishedGame();
    await goTo(`#/game/${game.id}/live`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Export stats (CSV)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Stats exported.');
    expect(shared[0]!.name).toBe(`next5-demo-hoopers-${game.date}-vs-rockets.csv`);
    expect(shared[0]!.type).toBe('text/csv');
    expect(shared[0]!.text).toMatch(/Player,Number,Planned segments,Segments played,Segments sat,Guard,Forward,Center/);
    expect(shared[0]!.text.trim().split('\r\n')).toHaveLength(10);
  });
});

describe('season stats (S4)', () => {
  it('has a Stats tab between Roster and Settings, after Games and Practice', async () => {
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await screen.findByRole('radio', { name: 'Games' });
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Games', 'Practice', 'Roster', 'Stats', 'Settings']);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Stats' }));
    expect(screen.getByText(/No finished games yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
  });

  it('adds up finished games, including the player who missed one', async () => {
    const user = userEvent.setup();
    const game = await finishedGame();
    await goTo(`#/team/${game.teamId}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Stats' }));
    expect(screen.getByText('From 1 finished game.')).toBeInTheDocument();
    expect(rows()).toHaveLength(10);
    const kai = rows().find((r) => within(r).getByRole('rowheader').textContent === 'Kai')!;
    expect(cells(kai)).toEqual(['0', '0', '–', '–']);
    const avery = rows().find((r) => within(r).getByRole('rowheader').textContent === 'Avery')!;
    const [games, played, percent] = cells(avery);
    expect(games).toBe('1');
    expect(percent).toBe(`${Math.round((Number(played) / 8) * 100)}%`);
  });

  it('exports the season as CSV (S5)', async () => {
    const user = userEvent.setup();
    const game = await finishedGame();
    await goTo(`#/team/${game.teamId}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Stats' }));
    await user.click(screen.getByRole('button', { name: 'Export season stats (CSV)' }));
    await waitFor(() => expect(shared).toHaveLength(1));
    expect(shared[0]!.name).toMatch(/^next5-demo-hoopers-season-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(shared[0]!.text).toMatch(/Player,Number,Games,Segments played,Segments available,% played,/);
    expect(shared[0]!.text).not.toMatch(/Rising|Steady|Go-To/);
    expect(await screen.findByRole('status')).toHaveTextContent('Stats exported.');
  });

  it('says so when the export is cancelled', async () => {
    const user = userEvent.setup();
    Object.assign(navigator, {
      share: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    });
    const game = await finishedGame();
    await goTo(`#/team/${game.teamId}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Stats' }));
    await user.click(screen.getByRole('button', { name: 'Export season stats (CSV)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Export cancelled.');
  });
});
