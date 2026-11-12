import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FORMAT,
  backupFileName,
  backupReminderDue,
  createBackup,
  lastBackupAt,
  markBackedUp,
  parseBackup,
  restoreBackup,
  snoozeReminder,
  summarize,
} from './backup';
import { db } from './db';
import { addPlayer, createDemoTeam, createGame, createTeam, updateTeam } from './repo';
import { shareFile } from './share';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear(), db.drills.clear(), db.practices.clear()]);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function counts() {
  return { teams: await db.teams.count(), players: await db.players.count(), games: await db.games.count() };
}

describe('createBackup and parseBackup', () => {
  it('round-trips every team, player and game', async () => {
    const team = await createDemoTeam();
    await createGame(team);
    const backup = await createBackup();
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1 });
    expect(summarize(backup)).toEqual({ teamNames: ['Demo Hoopers'], players: 10, games: 1, practices: 0, drills: 0 });

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed).toEqual({ ok: true, backup });
  });

  it('backs up a single team with only its players and games', async () => {
    const a = await createDemoTeam();
    const b = await createTeam('Rockets');
    await addPlayer(b.id, { name: 'Zed', number: '1', skills: {} });
    await createGame(a);
    const backup = await createBackup(b.id);
    expect(summarize(backup)).toEqual({ teamNames: ['Rockets'], players: 1, games: 0, practices: 0, drills: 0 });
    expect(backupFileName(backup, b.name)).toMatch(/^next5-rockets-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backupFileName(backup)).toMatch(/^next5-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backupFileName(backup, '!!!')).toMatch(/^next5-team-/);
  });

  it('explains files that are not next5 backups', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, message: expect.stringMatching(/can't be read/) });
    expect(parseBackup('{"hello":1}')).toEqual({ ok: false, message: "This file isn't a next5 backup." });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }))).toEqual({
      ok: false,
      message: expect.stringMatching(/newer version/),
    });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, teams: [{}], players: [], games: [] }))).toEqual({
      ok: false,
      message: expect.stringMatching(/damaged/),
    });
  });

  it('brings games from older app versions up to date', () => {
    const old = { format: BACKUP_FORMAT, version: 1, exportedAt: 'x', teams: [], players: [], games: [{ id: 'g', played: [] }] };
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok && parsed.backup.games[0]).toEqual({ id: 'g', played: [], subbedOut: [], statuses: {}, events: [], locks: [] });
    const noDate = parseBackup(JSON.stringify({ ...old, exportedAt: undefined }));
    expect(noDate.ok && noDate.backup.exportedAt).toBe('');
  });
});

describe('restoreBackup', () => {
  it('replace: the device ends up exactly like the backup', async () => {
    const team = await createDemoTeam();
    await createGame(team);
    const backup = await createBackup();
    await createTeam('Made after the backup');
    expect((await counts()).teams).toBe(2);

    const result = await restoreBackup(backup, 'replace');
    expect(result).toEqual({ added: 12, updated: 0, kept: 0 });
    expect(await counts()).toEqual({ teams: 1, players: 10, games: 1 });
  });

  it('merge: adds what is missing, keeps the newer copy, deletes nothing', async () => {
    const team = await createTeam('Thunder');
    const backup = await createBackup();
    // Changed on this device after the backup: this copy is newer and wins.
    await updateTeam(team.id, { name: 'Thunder (renamed here)' });
    await createTeam('Only on this device');
    // Something only in the backup.
    const extra = { ...backup.teams[0]!, id: 'from-backup', name: 'Only in the backup' };
    const result = await restoreBackup({ ...backup, teams: [...backup.teams, extra] }, 'merge');

    expect(result).toEqual({ added: 1, updated: 0, kept: 1 });
    const names = (await db.teams.toArray()).map((t) => t.name).sort();
    expect(names).toEqual(['Only in the backup', 'Only on this device', 'Thunder (renamed here)']);
  });

  it('merge: a newer copy in the backup replaces the one on this device', async () => {
    const team = await createTeam('Thunder');
    const backup = await createBackup();
    const newer = { ...backup.teams[0]!, name: 'Thunder 2027', updatedAt: team.updatedAt + 1000 };
    const result = await restoreBackup({ ...backup, teams: [newer] }, 'merge');
    expect(result).toEqual({ added: 0, updated: 1, kept: 0 });
    expect((await db.teams.get(team.id))?.name).toBe('Thunder 2027');
  });
});

describe('backup reminder', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 3);

  it('only reminds when there is data to protect', () => {
    expect(backupReminderDue(false, now)).toBe(false);
    expect(backupReminderDue(true, now)).toBe(true);
  });

  it('stays quiet for 30 days after a backup', () => {
    markBackedUp(now);
    expect(lastBackupAt()).toBe(now);
    expect(backupReminderDue(true, now + 29 * DAY)).toBe(false);
    expect(backupReminderDue(true, now + 31 * DAY)).toBe(true);
  });

  it('can be snoozed for a week', () => {
    snoozeReminder(now);
    expect(backupReminderDue(true, now + 6 * DAY)).toBe(false);
    expect(backupReminderDue(true, now + 8 * DAY)).toBe(true);
  });

  it('treats unreadable storage as no backup yet', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(lastBackupAt()).toBeNull();
    markBackedUp(now);
    expect(backupReminderDue(true, now)).toBe(true);
  });
});

describe('shareFile', () => {
  afterEach(() => {
    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  it('opens the share sheet when the browser can share files', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    expect(await shareFile('b.json', '{}')).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'b.json' }));
  });

  it('reports when the coach closes the share sheet', async () => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('closed', 'AbortError');
      },
    });
    expect(await shareFile('b.json', '{}')).toBe('cancelled');
  });

  it('downloads the file where sharing is not available or fails', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await shareFile('b.json', '{}')).toBe('downloaded');
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new Error('not allowed');
      },
    });
    expect(await shareFile('b.json', '{}')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(2);
  });
});
