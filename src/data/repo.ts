import { db } from './db';
import { receivedHandoff, roleOf, type GameHandoff } from './handoff';
import { DEFAULT_FORMAT, DEFAULT_POSITIONS, DEFAULT_RULES, DEMO_PLAYERS } from './defaults';
import { STARTER_DRILLS } from './starterDrills';
import type { Drill, Game, Player, Practice, Station, Team } from './types';

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

/**
 * Archives a team (M1): it leaves the teams list but keeps its players,
 * games and stats, and can be unarchived at any time.
 */
export async function setTeamArchived(id: string, archived: boolean): Promise<void> {
  await updateTeam(id, { archived });
}

/** Deletes a team with its players, games and practices. */
export async function deleteTeam(id: string): Promise<void> {
  await db.transaction('rw', [db.teams, db.players, db.games, db.practices], async () => {
    await db.players.where('teamId').equals(id).delete();
    await db.games.where('teamId').equals(id).delete();
    await db.practices.where('teamId').equals(id).delete();
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

// Drills (PR2, PR3)

export type DrillFields = Pick<Drill, 'name' | 'minutes' | 'court' | 'tags' | 'equipment' | 'notes'>;

export async function createDrill(fields: DrillFields): Promise<Drill> {
  const drill: Drill = stamp({ ...fields, name: fields.name.trim(), retired: false });
  await db.drills.add(drill);
  return drill;
}

export async function updateDrill(id: string, changes: Partial<Omit<Drill, 'id' | 'createdAt'>>): Promise<void> {
  await db.drills.update(id, { ...changes, updatedAt: Date.now() });
}

/** True when a practice uses the drill, so deleting it would lose history. */
export async function drillInUse(id: string): Promise<boolean> {
  const practices = await db.practices.toArray();
  return practices.some((p) => p.blocks.some((b) => b.stations.some((s) => s.drillId === id)));
}

/** Deletes a drill no practice uses; returns false (and keeps it) if one does. Retire it instead. */
export async function deleteDrill(id: string): Promise<boolean> {
  return db.transaction('rw', db.drills, db.practices, async () => {
    if (await drillInUse(id)) return false;
    await db.drills.delete(id);
    return true;
  });
}

/** Adds the starter drills not already in the library (PR3). Returns how many were added. */
export async function addStarterDrills(): Promise<number> {
  return db.transaction('rw', db.drills, async () => {
    const have = new Set((await db.drills.toArray()).map((d) => d.starter).filter(Boolean));
    const missing = STARTER_DRILLS.filter((s) => !have.has(s.key));
    await db.drills.bulkAdd(
      missing.map(({ key, ...fields }) => stamp({ ...fields, tags: [...fields.tags], equipment: [...fields.equipment], retired: false, starter: key })),
    );
    return missing.length;
  });
}

// Practices (PR1, PR4–PR8)

/** A new practice: today, every active player attending, an empty plan (PR1). */
export async function createPractice(team: Team): Promise<Practice> {
  const players = await db.players.where('teamId').equals(team.id).toArray();
  const practice: Practice = stamp({
    teamId: team.id,
    date: today(),
    time: '',
    length: 75,
    focus: '',
    parentNote: '',
    attending: players.filter((p) => p.active).map((p) => p.id),
    blocks: [],
    teams: { A: [], B: [] },
    status: 'planned' as const,
    current: 0,
    clock: { startedAt: null, elapsed: 0 },
    wentWell: '',
    improve: '',
  });
  await db.practices.add(practice);
  return practice;
}

export async function updatePractice(id: string, changes: Partial<Omit<Practice, 'id' | 'teamId' | 'createdAt'>>): Promise<void> {
  await db.practices.update(id, { ...changes, updatedAt: Date.now() });
}

/**
 * Changes a practice from its latest saved copy, so quick taps on the plan
 * or the timer never overwrite each other.
 */
export async function editPractice(id: string, change: (practice: Practice) => Partial<Practice> | null): Promise<void> {
  await db.transaction('rw', db.practices, async () => {
    const practice = await db.practices.get(id);
    if (!practice) return;
    const changes = change(practice);
    if (changes) await db.practices.update(id, { ...changes, updatedAt: Date.now() });
  });
}

/** Changes one station of one block (rating, note, coach, group, drill). */
export async function updateStation(practiceId: string, blockId: string, index: number, changes: Partial<Station>): Promise<void> {
  await editPractice(practiceId, (p) => ({
    blocks: p.blocks.map((b) =>
      b.id !== blockId ? b : { ...b, stations: b.stations.map((s, i) => (i === index ? { ...s, ...changes } : s)) },
    ),
  }));
}

export async function deletePractice(id: string): Promise<void> {
  await db.practices.delete(id);
}

export async function togglePracticeAttending(practiceId: string, playerId: string): Promise<void> {
  await editPractice(practiceId, (p) => {
    const attending = p.attending.includes(playerId) ? p.attending.filter((id) => id !== playerId) : [...p.attending, playerId];
    // Someone not coming can't be on a scrimmage team.
    const teams = { A: p.teams.A.filter((id) => attending.includes(id)), B: p.teams.B.filter((id) => attending.includes(id)) };
    return { attending, teams };
  });
}

/**
 * Erases every team, player, game, drill and practice, and the app's saved
 * settings, as if next5 were new on this phone. Only beta builds offer it (REL5).
 */
export async function eraseEverything(storage: Storage = localStorage): Promise<void> {
  await db.transaction('rw', [db.teams, db.players, db.games, db.drills, db.practices], async () => {
    await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear(), db.drills.clear(), db.practices.clear()]);
  });
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k?.startsWith('next5.'));
    for (const key of keys) storage.removeItem(key!);
  } catch {
    // Storage unavailable: nothing saved there to erase.
  }
}

// Handing a game to the assistant and back (SH1–SH6)

/**
 * Records that this phone shared the game. Until it comes back (or Take back
 * control), the other phone runs it (SH5); a finished game is shared only
 * for the records, so this phone keeps it. The game's updatedAt is set to
 * the same moment, so any later edit shows as "changed since you shared it".
 */
export async function markSent(gameId: string, n: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.games, async () => {
    const game = await db.games.get(gameId);
    if (!game) return;
    const away = game.status !== 'final';
    await db.games.update(gameId, { handoff: { n, role: roleOf(game), away, sentAt: now }, updatedAt: now });
  });
}

/** True while the other phone runs this game: shared, not finished, and not taken back (SH5). */
export const sharedAway = (game: Game): boolean => !!game.handoff?.away && game.status !== 'final';

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
