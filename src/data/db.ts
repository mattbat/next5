import Dexie, { type EntityTable } from 'dexie';
import type { Game, Player, Team } from './types';

/**
 * IndexedDB schema (REQUIREMENTS.md T6, T7). To change it, add a new
 * `version(n)` with an `upgrade()` migration; never edit an existing version.
 */
export class Next5Db extends Dexie {
  teams!: EntityTable<Team, 'id'>;
  players!: EntityTable<Player, 'id'>;
  games!: EntityTable<Game, 'id'>;

  constructor(name = 'next5') {
    super(name);
    this.version(1).stores({
      teams: 'id, name, archived',
      players: 'id, teamId',
      games: 'id, teamId, date, status',
    });
    // v2: game-day changes. Games gain subbedOut, statuses and events.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('games')
          .toCollection()
          .modify((game: Partial<Game>) => upgradeGameV2(game)),
      );
    // v3: planning locks (G6).
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('games')
          .toCollection()
          .modify((game: Partial<Game>) => upgradeGameV3(game)),
      );
  }
}

/** Fills in the fields added in schema v2. Exported for tests. */
export function upgradeGameV2(game: Partial<Game>): void {
  game.subbedOut ??= [];
  game.statuses ??= {};
  game.events ??= [];
}

/** Fills in the fields added in schema v3. Exported for tests. */
export function upgradeGameV3(game: Partial<Game>): void {
  game.locks ??= [];
}

export const db = new Next5Db();

/** Asks the browser not to evict our data under storage pressure (T6). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
