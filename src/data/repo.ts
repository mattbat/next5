import { db } from './db';
import { DEFAULT_FORMAT, DEFAULT_POSITIONS, DEFAULT_RULES, DEMO_PLAYERS } from './defaults';
import type { Game, Player, Team } from './types';

/**
 * The only module that reads and writes storage. Screens call these
 * functions so the storage backend can be swapped or mirrored later (§16).
 */

export function newId(): string {
  return crypto.randomUUID();
}

function stamp<T extends object>(fields: T): T & { id: string; createdAt: number; updatedAt: number } {
  const now = Date.now();
  return { id: newId(), createdAt: now, updatedAt: now, ...fields };
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Teams

export async function createTeam(name: string): Promise<Team> {
  const team: Team = stamp({
    name: name.trim(),
    positions: DEFAULT_POSITIONS,
    requirement: { G: 2 },
    defaultFormat: DEFAULT_FORMAT,
    defaultRules: DEFAULT_RULES,
    archived: false,
  });
  await db.teams.add(team);
  return team;
}

export async function updateTeam(id: string, changes: Partial<Omit<Team, 'id' | 'createdAt'>>): Promise<void> {
  await db.teams.update(id, { ...changes, updatedAt: Date.now() });
}

/** Deletes a team with its players and games. */
export async function deleteTeam(id: string): Promise<void> {
  await db.transaction('rw', db.teams, db.players, db.games, async () => {
    await db.players.where('teamId').equals(id).delete();
    await db.games.where('teamId').equals(id).delete();
    await db.teams.delete(id);
  });
}

export async function createDemoTeam(): Promise<Team> {
  const team = await createTeam('Demo Hoopers');
  await updateTeam(team.id, { requirement: { G: 2, C: 1 } });
  await db.players.bulkAdd(
    DEMO_PLAYERS.map((p) => stamp({ teamId: team.id, name: p.name, number: p.number, skills: p.skills, active: true })),
  );
  return (await db.teams.get(team.id))!;
}

// Players

export async function addPlayer(teamId: string, fields: Pick<Player, 'name' | 'number' | 'skills'>): Promise<Player> {
  const player: Player = stamp({ teamId, ...fields, name: fields.name.trim(), active: true });
  await db.players.add(player);
  return player;
}

export async function updatePlayer(id: string, changes: Partial<Omit<Player, 'id' | 'teamId' | 'createdAt'>>): Promise<void> {
  await db.players.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deletePlayer(id: string): Promise<void> {
  await db.players.delete(id);
}

// Games

/** Creates a game from the team's defaults with every active player attending (G1–G3). */
export async function createGame(team: Team): Promise<Game> {
  const players = await db.players.where('teamId').equals(team.id).toArray();
  const game: Game = stamp({
    teamId: team.id,
    date: today(),
    opponent: '',
    attending: players.filter((p) => p.active).map((p) => p.id),
    format: team.defaultFormat,
    rules: team.defaultRules,
    plan: [],
    warnings: [],
    seed: 1,
    status: 'planned' as const,
    current: 0,
    played: [],
  });
  await db.games.add(game);
  return game;
}

export async function saveGame(game: Game): Promise<void> {
  await db.games.put({ ...game, updatedAt: Date.now() });
}

/**
 * Changes only the given fields. Screens use this for quick edits so two fast
 * taps can't overwrite each other with an older copy of the game.
 */
export async function updateGame(id: string, changes: Partial<Omit<Game, 'id' | 'teamId' | 'createdAt'>>): Promise<void> {
  await db.games.update(id, { ...changes, updatedAt: Date.now() });
}

/** Adds or removes a player from the game's attendance; clears the plan (G1). */
export async function toggleAttending(gameId: string, playerId: string): Promise<void> {
  await db.transaction('rw', db.games, async () => {
    const game = await db.games.get(gameId);
    if (!game) return;
    const attending = game.attending.includes(playerId)
      ? game.attending.filter((id) => id !== playerId)
      : [...game.attending, playerId];
    await db.games.update(gameId, { attending, plan: [], warnings: [], updatedAt: Date.now() });
  });
}

export async function deleteGame(id: string): Promise<void> {
  await db.games.delete(id);
}
