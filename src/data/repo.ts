import { db } from './db';
import { receivedHandoff, roleOf, type GameHandoff } from './handoff';
import { DEFAULT_FORMAT, DEFAULT_POSITIONS, DEFAULT_RULES, DEMO_PLAYERS } from './defaults';
import type { Game, Player, Team } from './types';

/**
 * The only module that reads and writes storage. Screens call these
 * functions so the storage backend can be swapped or mirrored later (§16).
 */

/**
 * A random v4 UUID. `crypto.randomUUID` only exists on https pages, so fall
 * back to `getRandomValues` (available everywhere) for local http testing.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    subbedOut: [],
    statuses: {},
    events: [],
    locks: [],
  });
  await db.games.add(game);
  return game;
}

/** The latest saved copy of a game, for actions that must not use a stale screen copy. */
export async function getGame(id: string): Promise<Game | undefined> {
  return db.games.get(id);
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

/** Adds or removes a player from the game's attendance; clears the plan and that player's locks (G1). */
export async function toggleAttending(gameId: string, playerId: string): Promise<void> {
  await db.transaction('rw', db.games, async () => {
    const game = await db.games.get(gameId);
    if (!game) return;
    const attending = game.attending.includes(playerId)
      ? game.attending.filter((id) => id !== playerId)
      : [...game.attending, playerId];
    const locks = game.locks.filter((l) => l.playerId !== playerId);
    await db.games.update(gameId, { attending, locks, plan: [], warnings: [], updatedAt: Date.now() });
  });
}

export async function deleteGame(id: string): Promise<void> {
  await db.games.delete(id);
}

// Handing a game to the assistant and back (SH1–SH6)

/**
 * Records that this phone sent the game. The game's updatedAt is set to the
 * same moment, so any later edit shows as "changed since you sent it".
 */
export async function markSent(gameId: string, n: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.games, async () => {
    const game = await db.games.get(gameId);
    if (!game) return;
    await db.games.update(gameId, { handoff: { n, role: roleOf(game), away: true, sentAt: now }, updatedAt: now });
  });
}

/** True when the game was edited after it was last sent. */
export const changedSinceSent = (game: Game): boolean =>
  !!game.handoff?.away && game.handoff.sentAt !== undefined && game.updatedAt > game.handoff.sentAt;

/** Take back control (SH5): this phone runs the game again. Raising the number makes a crossing copy ask first. */
export async function takeBack(gameId: string): Promise<void> {
  await db.transaction('rw', db.games, async () => {
    const game = await db.games.get(gameId);
    if (!game?.handoff) return;
    await updateGame(gameId, { handoff: { n: game.handoff.n + 1, role: game.handoff.role, away: false } });
  });
}

/**
 * Keeps a received game (SH4). The team and players merge the way a backup
 * does (missing ones added, the more recently changed copy wins); the game
 * replaces this phone's copy. Call `decideReceive` first.
 */
export async function receiveGame(incoming: GameHandoff): Promise<void> {
  await db.transaction('rw', db.teams, db.players, db.games, async () => {
    const existingTeam = await db.teams.get(incoming.team.id);
    if (!existingTeam || incoming.team.updatedAt > existingTeam.updatedAt) await db.teams.put(incoming.team);
    for (const player of incoming.players) {
      const existing = await db.players.get(player.id);
      if (!existing || player.updatedAt > existing.updatedAt) await db.players.put(player);
    }
    // Keep the sender's updatedAt, so opening the same link twice is recognised.
    await db.games.put({ ...incoming.game, handoff: receivedHandoff(incoming) });
  });
}
