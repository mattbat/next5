/**
 * Integration tests for the screens, run against an in-memory IndexedDB.
 * They walk the main workflow the way the coach would.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { db } from './data/db';
import { createDemoTeam, createGame, saveGame } from './data/repo';
import { planGame, startGame } from './domain/game';
import { parseRoute } from './router';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  window.location.hash = '#/';
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('router', () => {
  it('parses every route and falls back to the teams list', () => {
    expect(parseRoute('')).toEqual({ name: 'teams' });
    expect(parseRoute('#/team/abc')).toEqual({ name: 'team', teamId: 'abc' });
    expect(parseRoute('#/game/g1')).toEqual({ name: 'game-setup', gameId: 'g1' });
    expect(parseRoute('#/game/g1/plan')).toEqual({ name: 'game-plan', gameId: 'g1' });
    expect(parseRoute('#/game/g1/live')).toEqual({ name: 'game-live', gameId: 'g1' });
    expect(parseRoute('#/nope')).toEqual({ name: 'teams' });
    expect(parseRoute('#/diagnostics')).toEqual({ name: 'diagnostics' });
  });
});

describe('teams', () => {
  it('shows the install hint and an empty state, and can dismiss the hint', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/No teams yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Add next5 to your Home Screen/)).not.toBeInTheDocument();
  });

  it('adds a team and opens it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('New team name'), '8U Thunder');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await goTo(window.location.hash);
    expect(await screen.findByRole('heading', { name: '8U Thunder' })).toBeInTheDocument();
    expect(screen.getByText(/No players yet. Add your roster on the Roster tab/)).toBeInTheDocument();
  });
});

describe('roster', () => {
  it('adds a player with positions and skill levels', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: /^Roster/ }));
    await user.click(await screen.findByRole('button', { name: '+ Add' }));
    const sheet = screen.getByRole('dialog', { name: 'New player' });
    await user.type(within(sheet).getByPlaceholderText('First name'), 'Maya');
    await user.type(within(sheet).getByLabelText('#'), '7');
    const guard = within(sheet).getByRole('radiogroup', { name: 'Guard skill' });
    await user.click(within(guard).getByRole('radio', { name: 'Go-To' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add player' }));
    expect(await screen.findByText('Maya')).toBeInTheDocument();
    const maya = await db.players.filter((p) => p.name === 'Maya').first();
    expect(maya).toMatchObject({ number: '7', skills: { G: 3 } });
  });

  it('edits a player, removes a position, and marks them inactive', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: /^Roster/ }));
    await user.click(await screen.findByText('Avery'));
    const sheet = screen.getByRole('dialog', { name: 'Edit player' });
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Forward skill' })).getByRole('radio', { name: '—' }));
    await user.click(within(sheet).getByRole('switch'));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const avery = await db.players.filter((p) => p.name === 'Avery').first();
      expect(avery).toMatchObject({ skills: { G: 3 }, active: false });
    });
    expect(screen.getByRole('radio', { name: 'Roster (9)' })).toBeInTheDocument();
  });

  it('removes a player after confirming', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: /^Roster/ }));
    await user.click(await screen.findByText('Kai'));
    await user.click(screen.getByRole('button', { name: 'Remove player' }));
    await waitFor(() => expect(screen.queryByText('Kai')).not.toBeInTheDocument());
  });
});

describe('team settings', () => {
  it('changes the requirement, format and rules, and explains a rule', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'More Forward required' }));
    await user.click(screen.getByRole('radio', { name: 'Halves' }));
    await user.click(screen.getByRole('switch', { name: 'Balance skill' }));
    await user.click(screen.getByRole('button', { name: "About Don't sit too long" }));
    expect(screen.getByText(/nobody sits twice in a row/)).toBeInTheDocument();
    await waitFor(async () => {
      const saved = await db.teams.get(team.id);
      expect(saved?.requirement).toEqual({ G: 2, C: 1, F: 1 });
      expect(saved?.defaultFormat).toEqual({ periodType: 'halves', segmentsPerPeriod: 4 });
      expect(saved?.defaultRules.balanceSkill).toBe(true);
    });
  });

  it('renames and deletes a team', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Settings' }));
    const name = screen.getByDisplayValue('Demo Hoopers');
    await user.clear(name);
    await user.type(name, 'Rockets');
    await user.tab();
    await waitFor(async () => expect((await db.teams.get(team.id))?.name).toBe('Rockets'));
    await user.click(screen.getByRole('button', { name: 'Delete team' }));
    await waitFor(async () => expect(await db.teams.count()).toBe(0));
  });
});

describe('game workflow', () => {
  it('sets up a game, generates a plan, and runs it to the end', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await goTo(`#/team/${team.id}`);
    render(<App />);

    await user.click(await screen.findByRole('radio', { name: 'Games' }));
    expect(screen.getByText(/No games yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ New game' }));
    await goTo(window.location.hash);

    await user.type(await screen.findByLabelText('Opponent'), 'Rockets');
    await user.click(screen.getByLabelText('Kai attending'));
    await user.click(screen.getByRole('button', { name: 'More segments per period' }));
    expect(await screen.findByText('12 lineups in this game.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fewer segments per period' }));
    await user.click(screen.getByRole('button', { name: 'Generate plan' }));
    await goTo(window.location.hash);

    expect(await screen.findByRole('heading', { name: 'vs Rockets' })).toBeInTheDocument();
    // The plan opens one segment at a time; the grid shows it all.
    expect(screen.getByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'On court' })).getAllByRole('listitem')).toHaveLength(5);
    await user.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('Kai')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '↻ Shuffle' }));
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    await goTo(window.location.hash);

    expect(await screen.findByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↶ Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Q1 · 2 of 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '↶ Undo' }));
    expect(await screen.findByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();

    for (let i = 0; i < 7; i++) await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/This is the final lineup/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End game' }));
    expect(await screen.findByRole('heading', { name: 'Final' })).toBeInTheDocument();
    expect(screen.getByText(/^Segments played out of 8./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '↶ Undo end of game' }));
    expect(await screen.findByRole('button', { name: 'End game' })).toBeInTheDocument();
  });

  it('explains why a plan cannot be generated', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    const game = await createGame(team);
    await saveGame({ ...game, attending: game.attending.slice(0, 3) });
    await goTo(`#/game/${game.id}`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Generate plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 3 players are available');
  });

  it('shows plan warnings in plain language', async () => {
    const team = await createDemoTeam();
    const game = await createGame(team);
    await saveGame({ ...game, plan: [], warnings: [{ kind: 'skill-stack', segment: 0 }] });
    const saved = (await db.games.get(game.id))!;
    const outcome = planGame(saved, team, await db.players.toArray());
    if (!outcome.ok) throw new Error('plan failed');
    await saveGame({ ...saved, plan: outcome.plan, warnings: [{ kind: 'skill-stack', segment: 0 }] });
    await goTo(`#/game/${game.id}/plan`);
    render(<App />);
    expect(await screen.findByText(/Q1 · 1 of 2 has an unbalanced mix/)).toBeInTheDocument();
  });

  it('lists games by status and opens a live game from the team', async () => {
    const team = await createDemoTeam();
    const game = await createGame(team);
    const outcome = planGame(game, team, await db.players.toArray());
    if (!outcome.ok) throw new Error('plan failed');
    await saveGame(startGame({ ...game, opponent: 'Hawks', plan: outcome.plan }));
    await goTo(`#/team/${team.id}`);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Games' }));
    const link = await screen.findByRole('link', { name: /vs Hawks/ });
    expect(link).toHaveAttribute('href', `#/game/${game.id}/live`);
    expect(within(link).getByText('In progress')).toBeInTheDocument();

    // Setup is read-only once the game has started.
    await goTo(`#/game/${game.id}`);
    expect(await screen.findByRole('link', { name: 'Back to game' })).toBeInTheDocument();
    await goTo(`#/game/${game.id}/plan`);
    expect(await screen.findByRole('link', { name: 'Back to game' })).toBeInTheDocument();
  });

  it('shows a helpful message for a game that has not started or does not exist', async () => {
    const team = await createDemoTeam();
    const game = await createGame(team);
    await goTo(`#/game/${game.id}/live`);
    render(<App />);
    expect(await screen.findByText(/This game hasn't started/)).toBeInTheDocument();
    await goTo(`#/game/${game.id}/plan`);
    expect(await screen.findByText(/No plan yet/)).toBeInTheDocument();
    for (const hash of ['#/game/missing', '#/game/missing/plan', '#/game/missing/live', '#/team/missing']) {
      await goTo(hash);
      expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
    }
  });

  it('deletes a game that has not started', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const team = await createDemoTeam();
    const game = await createGame(team);
    await goTo(`#/game/${game.id}`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Delete game' }));
    await waitFor(async () => expect(await db.games.count()).toBe(0));
  });
});
