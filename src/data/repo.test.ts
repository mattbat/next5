import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, Next5Db } from './db';
import {
  addPlayer,
  createDemoTeam,
  createGame,
  createTeam,
  deleteGame,
  deletePlayer,
  deleteTeam,
  newId,
  saveGame,
  setTeamArchived,
  toggleAttending,
  updatePlayer,
  updateTeam,
} from './repo';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
});

describe('newId', () => {
  it('makes v4 UUIDs even where crypto.randomUUID is missing (plain http)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 100 }, newId));
      expect(ids.size).toBe(100);
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('uses crypto.randomUUID when available', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
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

  it('archives and unarchives a team, keeping its players and games (M1)', async () => {
    const team = await createDemoTeam();
    await createGame(team);
    await setTeamArchived(team.id, true);
    expect(await db.teams.get(team.id)).toMatchObject({ archived: true });
    expect(await db.players.where('teamId').equals(team.id).count()).toBe(10);
    expect(await db.games.where('teamId').equals(team.id).count()).toBe(1);
    await setTeamArchived(team.id, false);
    expect(await db.teams.get(team.id)).toMatchObject({ archived: false });
  });

  it('drops the locks of a player who stops attending (G1, G6)', async () => {
    const team = await createTeam('Lions');
    const a = await addPlayer(team.id, { name: 'Ava', number: '1', skills: {} });
    const b = await addPlayer(team.id, { name: 'Bea', number: '2', skills: {} });
    const game = await createGame(team);
    await saveGame({
      ...game,
      locks: [
        { segment: 0, playerId: a.id, kind: 'in' },
        { segment: 1, playerId: b.id, kind: 'out' },
      ],
    });
    await toggleAttending(game.id, a.id);
    const saved = await db.games.get(game.id);
    expect(saved?.attending).toEqual([b.id]);
    expect(saved?.locks).toEqual([{ segment: 1, playerId: b.id, kind: 'out' }]);
  });

  it('creates a demo team that can cover its positions', async () => {
    const team = await createDemoTeam();
    expect(team.requirement).toEqual({ G: 2, C: 1 });
    expect(await db.players.where('teamId').equals(team.id).count()).toBe(10);
  });
});

describe('schema migrations', () => {
  it('upgrades a v1 database to the latest version without losing data (T7)', async () => {
    const name = `migration-test-${newId()}`;
    // Write a game the way version 1 of the app stored it.
    const v1 = new Dexie(name);
    v1.version(1).stores({ teams: 'id, name, archived', players: 'id, teamId', games: 'id, teamId, date, status' });
    await v1.table('games').add({ id: 'g1', teamId: 't1', date: '2026-10-01', status: 'final', opponent: 'Hawks', played: [[]] });
    v1.close();

    const upgraded = new Next5Db(name);
    const game = await upgraded.games.get('g1');
    expect(game).toMatchObject({ opponent: 'Hawks', played: [[]], subbedOut: [], statuses: {}, events: [], locks: [] });
    upgraded.close();
    await Dexie.delete(name);
  });

  it('upgrades a v2 database to v3, adding locks and keeping everything else (T7)', async () => {
    const name = `migration-test-${newId()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ teams: 'id, name, archived', players: 'id, teamId', games: 'id, teamId, date, status' });
    v2.version(2).stores({});
    const events = [{ kind: 'replan', segment: 2, changes: 1 }];
    await v2.table('games').add({ id: 'g1', teamId: 't1', status: 'live', subbedOut: [], statuses: {}, events });
    v2.close();

    const upgraded = new Next5Db(name);
    expect(await upgraded.games.get('g1')).toMatchObject({ status: 'live', events, locks: [] });
    upgraded.close();
    await Dexie.delete(name);
  });
});
