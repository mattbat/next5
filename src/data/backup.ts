import { db, upgradeGameV2, upgradeGameV3 } from './db';
import { shareFile } from './share';
import type { Game, Player, Team } from './types';

/**
 * Backup and restore (REQUIREMENTS.md B1–B3). A backup is a JSON file with
 * every team, player and game (or one team's), which the coach saves through
 * the iOS share sheet and can restore later on any device.
 */

export const BACKUP_FORMAT = 'next5-backup';
/** Version of the backup file layout (not the app). */
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  teams: Team[];
  players: Player[];
  games: Game[];
}

/** Collects everything, or one team with its players and games. */
export async function createBackup(teamId?: string): Promise<Backup> {
  const [teams, players, games] = teamId
    ? await Promise.all([
        db.teams.where('id').equals(teamId).toArray(),
        db.players.where('teamId').equals(teamId).toArray(),
        db.games.where('teamId').equals(teamId).toArray(),
      ])
    : await Promise.all([db.teams.toArray(), db.players.toArray(), db.games.toArray()]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), teams, players, games };
}

/** Lowercase words joined by dashes, for file names. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** e.g. next5-backup-2026-11-03.json, or next5-8u-thunder-2026-11-03.json for one team. */
export function backupFileName(backup: Backup, teamName?: string): string {
  const date = backup.exportedAt.slice(0, 10);
  return teamName ? `next5-${slug(teamName) || 'team'}-${date}.json` : `next5-backup-${date}.json`;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; message: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const hasId = (value: unknown) => isObject(value) && typeof value.id === 'string';

/**
 * Reads a backup file and checks it before anything is changed. Games from
 * older app versions are brought up to date the same way the database is.
 */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file isn't a next5 backup (it can't be read)." };
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, message: "This file isn't a next5 backup." };
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return { ok: false, message: 'This backup was made by a newer version of next5. Update the app, then try again.' };
  }
  const { teams, players, games } = data;
  if (![teams, players, games].every((list) => Array.isArray(list) && list.every(hasId))) {
    return { ok: false, message: 'This backup is damaged and can’t be restored.' };
  }
  const gameList = (games as Partial<Game>[]).map((game) => {
    const copy = structuredClone(game);
    upgradeGameV2(copy);
    upgradeGameV3(copy);
    return copy as Game;
  });
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: data.version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      teams: teams as Team[],
      players: players as Player[],
      games: gameList,
    },
  };
}

export interface BackupSummary {
  teamNames: string[];
  players: number;
  games: number;
}

export function summarize(backup: Backup): BackupSummary {
  return {
    teamNames: backup.teams.map((t) => t.name),
    players: backup.players.length,
    games: backup.games.length,
  };
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  added: number;
  updated: number;
  kept: number;
}

/**
 * Restores a backup (B2).
 * - replace: everything on this device is replaced by the backup.
 * - merge: records missing here are added; for records in both, the more
 *   recently changed copy wins. Nothing on this device is deleted.
 */
export async function restoreBackup(backup: Backup, mode: RestoreMode): Promise<RestoreResult> {
  const result: RestoreResult = { added: 0, updated: 0, kept: 0 };
  await db.transaction('rw', db.teams, db.players, db.games, async () => {
    if (mode === 'replace') {
      await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
      await db.teams.bulkPut(backup.teams);
      await db.players.bulkPut(backup.players);
      await db.games.bulkPut(backup.games);
      result.added = backup.teams.length + backup.players.length + backup.games.length;
      return;
    }
    const merge = async <T extends { id: string; updatedAt: number }>(
      items: T[],
      get: (id: string) => Promise<T | undefined>,
      put: (item: T) => Promise<unknown>,
    ) => {
      for (const item of items) {
        const existing = await get(item.id);
        if (!existing) {
          await put(item);
          result.added++;
        } else if ((item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          await put(item);
          result.updated++;
        } else {
          result.kept++;
        }
      }
    };
    await merge(backup.teams, (id) => db.teams.get(id), (t) => db.teams.put(t));
    await merge(backup.players, (id) => db.players.get(id), (p) => db.players.put(p));
    await merge(backup.games, (id) => db.games.get(id), (g) => db.games.put(g));
  });
  return result;
}

// Backup reminder (B3). Kept in localStorage: it only matters on this device,
// and if site data is cleared the reminder rightly shows again.

const LAST_BACKUP_KEY = 'next5.lastBackupAt';
const SNOOZE_KEY = 'next5.backupReminderSnoozedUntil';
const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_DAYS = 30;
export const SNOOZE_DAYS = 7;

function read(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private browsing or storage full: the reminder just shows again.
  }
}

export function lastBackupAt(): number | null {
  return read(LAST_BACKUP_KEY);
}

export function markBackedUp(now = Date.now()): void {
  write(LAST_BACKUP_KEY, now);
}

export function snoozeReminder(now = Date.now()): void {
  write(SNOOZE_KEY, now + SNOOZE_DAYS * DAY);
}

/** True when there's data worth protecting and no recent backup (or snooze). */
export function backupReminderDue(hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false;
  const snoozedUntil = read(SNOOZE_KEY);
  if (snoozedUntil !== null && now < snoozedUntil) return false;
  const last = lastBackupAt();
  return last === null || now - last > REMIND_AFTER_DAYS * DAY;
}

/** Backs up everything, or one team, through the share sheet (B1). */
export async function backUp(teamId?: string, teamName?: string): Promise<string> {
  const backup = await createBackup(teamId);
  const outcome = await shareFile(backupFileName(backup, teamName), JSON.stringify(backup, null, 1));
  if (outcome === 'cancelled') return 'Backup cancelled.';
  if (!teamId) markBackedUp();
  return outcome === 'shared'
    ? 'Backup ready. Make sure you saved it somewhere safe, like Files or iCloud Drive.'
    : 'Backup file downloaded.';
}
