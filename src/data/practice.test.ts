/** Drills and practices in storage, backups and the v4 migration (PR1–PR11, T7). */
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { db, Next5Db } from './db';
import {
  addStarterDrills,
  createDemoTeam,
  createDrill,
  createPractice,
  deleteDrill,
  deleteTeam,
  editPractice,
  newId,
  togglePracticeAttending,
  updateStation,
} from './repo';
import { STARTER_DRILLS } from './starterDrills';
import { isValidDrill, isValidPractice } from './validate';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear(), db.drills.clear(), db.practices.clear()]);
});

const FIELDS = { name: ' Closeouts ', minutes: 8, court: 'half' as const, tags: ['Defense'], equipment: ['Cones'], notes: '' };

describe('drills', () => {
  it('adds the starter drills once, skipping ones already there', async () => {
    expect(await addStarterDrills()).toBe(STARTER_DRILLS.length);
    const first = await db.drills.toArray();
    await db.drills.delete(first[0]!.id);
    expect(await addStarterDrills()).toBe(1);
    expect(await addStarterDrills()).toBe(0);
    expect(await db.drills.count()).toBe(STARTER_DRILLS.length);
    expect((await db.drills.toArray()).every(isValidDrill)).toBe(true);
  });

  it('deletes a drill only while no practice uses it', async () => {
    const team = await createDemoTeam();
    const drill = await createDrill(FIELDS);
    expect(drill.name).toBe('Closeouts');
    const practice = await createPractice(team);
    await editPractice(practice.id, () => ({ blocks: [{ id: 'b1', minutes: 8, skipped: false, stations: [{ drillId: drill.id, coach: '', group: 'all' }] }] }));
    expect(await deleteDrill(drill.id)).toBe(false);
    expect(await db.drills.get(drill.id)).toBeDefined();
    await editPractice(practice.id, () => ({ blocks: [] }));
    expect(await deleteDrill(drill.id)).toBe(true);
    expect(await db.drills.get(drill.id)).toBeUndefined();
  });
});

describe('practices', () => {
  it('starts like a new game: today, every active player attending, nothing planned', async () => {
    const team = await createDemoTeam();
    const practice = await createPractice(team);
    expect(practice.attending).toHaveLength(10);
    expect(practice).toMatchObject({ status: 'planned', blocks: [], teams: { A: [], B: [] } });
    expect(practice.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidPractice(practice)).toBe(true);
  });

  it('takes a player who stops attending off their scrimmage team', async () => {
    const team = await createDemoTeam();
    const practice = await createPractice(team);
    const [a, b] = practice.attending;
    await editPractice(practice.id, () => ({ teams: { A: [a!], B: [b!] } }));
    await togglePracticeAttending(practice.id, a!);
    expect(await db.practices.get(practice.id)).toMatchObject({ teams: { A: [], B: [b] } });
    await togglePracticeAttending(practice.id, a!);
    expect((await db.practices.get(practice.id))!.attending).toContain(a);
  });

  it('changes one station without touching the rest', async () => {
    const team = await createDemoTeam();
    const practice = await createPractice(team);
    const stations = [
      { drillId: 'd1', coach: '', group: 'all' as const },
      { drillId: 'd2', coach: '', group: 'all' as const },
    ];
    await editPractice(practice.id, () => ({ blocks: [{ id: 'b1', minutes: 8, skipped: false, stations }] }));
    await updateStation(practice.id, 'b1', 1, { rating: 'up', coach: 'Coach Sam' });
    expect((await db.practices.get(practice.id))!.blocks[0]!.stations).toEqual([
      stations[0],
      { drillId: 'd2', coach: 'Coach Sam', group: 'all', rating: 'up' },
    ]);
  });

  it('are deleted with their team', async () => {
    const team = await createDemoTeam();
    await createPractice(team);
    await deleteTeam(team.id);
    expect(await db.practices.count()).toBe(0);
  });
});

describe('backups with practices (PR11)', () => {
  it('round-trip drills and practices, including one team’s backup', async () => {
    const team = await createDemoTeam();
    await createDrill(FIELDS);
    await createPractice(team);
    const other = await createDemoTeam();
    await createPractice(other);

    const one = await createBackup(team.id);
    expect(one.practices).toHaveLength(1);
    expect(one.drills).toHaveLength(1);

    const parsed = parseBackup(JSON.stringify(await createBackup()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await Promise.all([db.drills.clear(), db.practices.clear()]);
    await restoreBackup(parsed.backup, 'replace');
    expect(await db.drills.count()).toBe(1);
    expect(await db.practices.count()).toBe(2);
  });

  it('restore a backup from before practices, keeping the drill library', async () => {
    const team = await createDemoTeam();
    await createDrill(FIELDS);
    await createPractice(team);
    const old: Partial<Awaited<ReturnType<typeof createBackup>>> = await createBackup();
    delete old.drills;
    delete old.practices;
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.drills).toBeUndefined();
    await restoreBackup(parsed.backup, 'replace');
    expect(await db.drills.count()).toBe(1);
    expect(await db.practices.count()).toBe(0);
  });

  it('merge drills and practices, keeping the newer copy', async () => {
    const drill = await createDrill(FIELDS);
    const backup = await createBackup();
    await db.drills.update(drill.id, { name: 'Newer', updatedAt: Date.now() + 1000 });
    const result = await restoreBackup(backup, 'merge');
    expect(result.kept).toBe(1);
    expect((await db.drills.get(drill.id))!.name).toBe('Newer');
  });

  it('turn away damaged drills and practices', async () => {
    const backup = await createBackup();
    const bad = (extra: object) => parseBackup(JSON.stringify({ ...backup, ...extra }));
    expect(bad({ drills: [{ id: 'd', court: 'moon' }] })).toMatchObject({ ok: false });
    expect(bad({ practices: [{ id: 'p', blocks: [{ id: 'b', stations: [{ drillId: 'd', coach: '', group: 'C' }] }] }] })).toMatchObject({ ok: false });
    expect(bad({ practices: [{ id: 'p', status: 'live', current: 3, blocks: [] }] })).toMatchObject({ ok: false });
    expect(bad({ drills: 'lots' })).toMatchObject({ ok: false });
  });
});

describe('schema v4', () => {
  it('adds drills and practices to a v3 database without losing anything (T7)', async () => {
    const name = `migration-test-${newId()}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ teams: 'id, name, archived', players: 'id, teamId', games: 'id, teamId, date, status' });
    v3.version(2).stores({});
    v3.version(3).stores({});
    await v3.table('teams').add({ id: 't1', name: '12U Comets', archived: false });
    await v3.table('games').add({ id: 'g1', teamId: 't1', status: 'final', subbedOut: [], statuses: {}, events: [], locks: [] });
    v3.close();

    const upgraded = new Next5Db(name);
    expect(await upgraded.teams.get('t1')).toMatchObject({ name: '12U Comets' });
    expect(await upgraded.games.get('g1')).toMatchObject({ status: 'final' });
    expect(await upgraded.drills.count()).toBe(0);
    expect(await upgraded.practices.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
