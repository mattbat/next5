import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addPlayer,
  createDemoTeam,
  createGame,
  createTeam,
  deleteGame,
  deletePlayer,
  deleteTeam,
  saveGame,
  updatePlayer,
  updateTeam,
} from './repo';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
});

describe('repo', () => {
  it('creates a team with sensible defaults', async () => {
    const team = await createTeam('  8U Thunder ');
    expect(team.name).toBe('8U Thunder');
    expect(team.positions.map((p) => p.name)).toEqual(['Guard', 'Forward', 'Center']);
    expect(team.defaultFormat).toEqual({ periodType: 'quarters', segmentsPerPeriod: 2 });
    expect(await db.teams.get(team.id)).toEqual(team);
  });

  it('updates a team and bumps updatedAt', async () => {
    const team = await createTeam('A');
    await updateTeam(team.id, { name: 'B' });
    const saved = await db.teams.get(team.id);
    expect(saved?.name).toBe('B');
    expect(saved!.updatedAt).toBeGreaterThanOrEqual(team.updatedAt);
  });

  it('adds, updates and deletes players', async () => {
    const team = await createTeam('A');
    const player = await addPlayer(team.id, { name: ' Maya ', number: '7', skills: { G: 2 } });
    expect(player).toMatchObject({ name: 'Maya', active: true, teamId: team.id });
    await updatePlayer(player.id, { skills: { G: 3, F: 1 } });
    expect((await db.players.get(player.id))?.skills).toEqual({ G: 3, F: 1 });
    await deletePlayer(player.id);
    expect(await db.players.count()).toBe(0);
  });

  it('creates a game with every active player attending', async () => {
    const team = await createTeam('A');
    const a = await addPlayer(team.id, { name: 'A', number: '', skills: {} });
    const b = await addPlayer(team.id, { name: 'B', number: '', skills: {} });
    await updatePlayer(b.id, { active: false });
    const game = await createGame(team);
    expect(game.attending).toEqual([a.id]);
    expect(game).toMatchObject({ status: 'planned', plan: [], played: [] });
    expect(game.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('saves and deletes games', async () => {
    const team = await createTeam('A');
    const game = await createGame(team);
    await saveGame({ ...game, opponent: 'Rockets' });
    expect((await db.games.get(game.id))?.opponent).toBe('Rockets');
    await deleteGame(game.id);
    expect(await db.games.count()).toBe(0);
  });

  it('deletes a team with its players and games', async () => {
    const team = await createDemoTeam();
    await createGame(team);
    await deleteTeam(team.id);
    expect(await db.teams.count()).toBe(0);
    expect(await db.players.count()).toBe(0);
    expect(await db.games.count()).toBe(0);
  });

  it('creates a demo team that can cover its positions', async () => {
    const team = await createDemoTeam();
    expect(team.requirement).toEqual({ G: 2, C: 1 });
    expect(await db.players.where('teamId').equals(team.id).count()).toBe(10);
  });
});
