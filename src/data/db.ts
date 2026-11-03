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
  }
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
