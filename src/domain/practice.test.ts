import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Drill, Player, Practice, PracticeBlock, Station, Team } from '../data/types';
import {
  addMinute,
  blockFor,
  coachesIn,
  drillNotes,
  elapsedMs,
  equipmentList,
  finishPractice,
  formatClock,
  formatTime,
  indexDrills,
  moveBlock,
  movePlayer,
  needsFullCourt,
  nextBlock,
  parentText,
  pauseClock,
  plannedMinutes,
  practicePlanText,
  practiceStats,
  remainingMs,
  resumeClock,
  skillOf,
  skipBlock,
  splitTeams,
  startPractice,
  stationCardText,
  teamSkill,
} from './practice';

const drill = (id: string, fields: Partial<Drill> = {}): Drill => ({
  id,
  createdAt: 0,
  updatedAt: 0,
  name: id,
  minutes: 10,
  court: 'half',
  tags: [],
  equipment: [],
  notes: '',
  retired: false,
  ...fields,
});

const station = (drillId: string, fields: Partial<Station> = {}): Station => ({ drillId, coach: '', group: 'all', ...fields });
const block = (id: string, minutes: number, stations: Station[], fields: Partial<PracticeBlock> = {}): PracticeBlock => ({
  id,
  minutes,
  stations,
  skipped: false,
  ...fields,
});

const practice = (fields: Partial<Practice> = {}): Practice => ({
  id: 'p1',
  createdAt: 0,
  updatedAt: 0,
  teamId: 't1',
  date: '2026-11-10',
  time: '',
  length: 60,
  focus: '',
  parentNote: '',
  attending: [],
  blocks: [],
  teams: { A: [], B: [] },
  status: 'planned',
  current: 0,
  clock: { startedAt: null, elapsed: 0 },
  wentWell: '',
  improve: '',
  ...fields,
});

const team = { id: 't1', name: '9U Comets', alwaysBring: ['Basketballs', 'Whistle'] } as Team;

const player = (id: string, skills: Player['skills'] = {}): Player => ({
  id,
  createdAt: 0,
  updatedAt: 0,
  teamId: 't1',
  name: id,
  number: '',
  skills,
  active: true,
});

const DRILLS = indexDrills([
  drill('warm', { name: 'Warm-up', minutes: 8, court: 'full', tags: ['Warm-up'] }),
  drill('shoot', { name: 'Form shooting', tags: ['Shooting'], equipment: ['basketballs', 'Cones'], notes: 'Elbow in.' }),
  drill('close', { name: 'Closeouts', tags: ['Defense'], equipment: ['Cones'] }),
  drill('water', { name: 'Water break', minutes: 2, tags: ['Break'] }),
]);

describe('the plan', () => {
  const plan = practice({
    blocks: [
      block('b1', 8, [station('warm')]),
      block('b2', 12, [station('shoot', { coach: 'Coach Sam', group: 'A' }), station('close', { coach: 'Coach Lee', group: 'B' })]),
      block('b3', 2, [station('water')], { skipped: true }),
    ],
  });

  it('totals the minutes, leaving out skipped blocks', () => {
    expect(plannedMinutes(plan)).toBe(20);
  });

  it('needs a full court only while a full-court drill is in the plan', () => {
    expect(needsFullCourt(plan, DRILLS)).toBe(true);
    expect(needsFullCourt({ blocks: plan.blocks.slice(1) }, DRILLS)).toBe(false);
  });

  it('lists equipment once, always-bring items first, with the drills that need each', () => {
    expect(equipmentList(plan, DRILLS, ['Basketballs', 'Whistle'])).toEqual([
      { item: 'Basketballs', for: ['Form shooting'] },
      { item: 'Whistle', for: [] },
      { item: 'Cones', for: ['Form shooting', 'Closeouts'] },
    ]);
  });

  it('names each coach once', () => {
    expect(coachesIn(plan)).toEqual(['Coach Sam', 'Coach Lee']);
  });

  it('adds a drill at its default length and moves blocks', () => {
    expect(blockFor(drill('x', { minutes: 7 }), 'b9')).toEqual(block('b9', 7, [station('x')]));
    const ids = (blocks: PracticeBlock[]) => blocks.map((b) => b.id);
    expect(ids(moveBlock(plan.blocks, 0, 1))).toEqual(['b2', 'b1', 'b3']);
    expect(ids(moveBlock(plan.blocks, 0, -1))).toEqual(['b1', 'b2', 'b3']);
    expect(ids(moveBlock(plan.blocks, 2, 1))).toEqual(['b1', 'b2', 'b3']);
  });
});

describe('scrimmage teams', () => {
  const roster = [
    player('a', { G: 3 }),
    player('b', { G: 3, F: 1 }),
    player('c', { F: 2 }),
    player('d', { F: 2 }),
    player('e', { C: 1 }),
    player('f', {}),
    player('g', { C: 2 }),
  ];

  it('rates a player by their best skill, or 1 with none', () => {
    expect(skillOf(player('x', { G: 1, F: 3 }))).toBe(3);
    expect(skillOf(player('x'))).toBe(1);
  });

  it('balances skill and spreads the strongest players', () => {
    const split = splitTeams(roster, 'balanced', () => 0.5);
    expect(split.A.length + split.B.length).toBe(7);
    expect(Math.abs(split.A.length - split.B.length)).toBeLessThanOrEqual(1);
    expect(Math.abs(teamSkill(split.A, roster) - teamSkill(split.B, roster))).toBeLessThanOrEqual(1);
    // The two Go-To guards end up on different teams.
    expect(split.A.includes('a')).not.toBe(split.A.includes('b'));
  });

  it('keeps two strong players at the same position apart, whatever the shuffle', () => {
    // The demo team's four Go-To players: two guards, a forward and a center.
    const strong = [player('Avery', { G: 3 }), player('Casey', { C: 3 }), player('Devon', { F: 3 }), player('Jordan', { G: 3 })];
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      const split = splitTeams(strong, 'balanced', () => r);
      expect(split.A.includes('Avery')).not.toBe(split.A.includes('Jordan'));
    }
  });

  it('deals a random split in turn', () => {
    const split = splitTeams(roster, 'random', () => 0);
    expect(split.A).toHaveLength(4);
    expect(split.B).toHaveLength(3);
  });

  it('moves a player to the other team', () => {
    expect(movePlayer({ A: ['a'], B: ['b'] }, 'a')).toEqual({ A: [], B: ['b', 'a'] });
    expect(movePlayer({ A: ['a'], B: ['b'] }, 'b')).toEqual({ A: ['a', 'b'], B: [] });
    expect(movePlayer({ A: [], B: [] }, 'c')).toEqual({ A: ['c'], B: [] });
  });

  // PR5, property: every player on exactly one team, sizes within one, and
  // a balanced split's skill totals within one Go-To player of each other.
  it('always splits everyone fairly', () => {
    const skill = fc.option(fc.constantFrom<1 | 2 | 3>(1, 2, 3), { nil: undefined });
    const players = fc.array(fc.record({ G: skill, F: skill, C: skill }), { minLength: 0, maxLength: 16 }).map((list) =>
      list.map((s, i) =>
        player(`p${i}`, Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Player['skills']),
      ),
    );
    fc.assert(
      fc.property(players, fc.constantFrom<'balanced' | 'random'>('balanced', 'random'), fc.double({ min: 0, max: 0.999, noNaN: true }), (list, mode, r) => {
        const split = splitTeams(list, mode, () => r);
        const all = [...split.A, ...split.B].sort();
        expect(all).toEqual(list.map((p) => p.id).sort());
        expect(Math.abs(split.A.length - split.B.length)).toBeLessThanOrEqual(1);
        if (mode === 'balanced') {
          expect(Math.abs(teamSkill(split.A, list) - teamSkill(split.B, list))).toBeLessThanOrEqual(3);
        }
      }),
    );
  });
});

describe('running a practice', () => {
  const plan = practice({
    blocks: [block('b1', 1, [station('warm')], { skipped: true }), block('b2', 5, [station('shoot')]), block('b3', 10, [station('close')])],
  });

  it('starts on the first block not skipped, and only with one', () => {
    expect(startPractice(plan, 1000)).toMatchObject({ status: 'live', current: 1, clock: { startedAt: 1000, elapsed: 0 } });
    expect(startPractice({ blocks: [] }, 1000)).toBeNull();
  });

  it('counts down, pauses and resumes, and adds a minute', () => {
    const live = { ...plan, ...startPractice(plan, 0)! };
    expect(remainingMs(live, 60_000)).toBe(4 * 60_000);
    const paused = { ...live, ...pauseClock(live, 60_000) };
    expect(elapsedMs(paused.clock, 999_999)).toBe(60_000);
    const resumed = { ...paused, ...resumeClock(paused, 100_000) };
    expect(elapsedMs(resumed.clock, 160_000)).toBe(120_000);
    expect(resumeClock(resumed, 200_000)).toEqual({ clock: resumed.clock });
    expect(remainingMs({ ...resumed, ...addMinute(resumed) }, 160_000)).toBe(4 * 60_000);
    expect(remainingMs(resumed, 400_000)).toBe(-60_000);
  });

  it('records how long each block took, and ends after the last', () => {
    const live = { ...plan, ...startPractice(plan, 0)! };
    const second = nextBlock(live, 330_000);
    expect(second.blocks[1]!.actualSeconds).toBe(330);
    expect(second).toMatchObject({ status: 'live', current: 2, clock: { startedAt: 330_000, elapsed: 0 } });
    const done = nextBlock(second, 930_000);
    expect(done.status).toBe('done');
    expect(done.blocks[2]!.actualSeconds).toBe(600);
  });

  it('skips a block without counting it', () => {
    const live = { ...plan, ...startPractice(plan, 0)! };
    const skipped = skipBlock(live, 20_000);
    expect(skipped.blocks[1]).toMatchObject({ skipped: true, actualSeconds: undefined });
    expect(skipped.current).toBe(2);
  });

  it('ends early, marking blocks not reached as skipped', () => {
    const live = { ...plan, ...startPractice(plan, 0)! };
    const done = finishPractice(live, 90_000);
    expect(done.status).toBe('done');
    expect(done.blocks[1]!.actualSeconds).toBe(90);
    expect(done.blocks[2]!.skipped).toBe(true);
  });

  it('formats the clock, including over time', () => {
    expect(formatClock(245_000)).toBe('4:05');
    expect(formatClock(200)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-30_000)).toBe('-0:30');
  });
});

describe('season stats', () => {
  const done = (id: string, date: string, blocks: PracticeBlock[]) => practice({ id, date, status: 'done', blocks });
  const practices = [
    done('p1', '2026-11-03', [
      block('b1', 10, [station('shoot', { rating: 'up' })], { actualSeconds: 720 }),
      block('b2', 10, [station('close'), station('shoot')]),
      block('b3', 5, [station('warm')], { skipped: true }),
    ]),
    done('p2', '2026-11-10', [block('b1', 10, [station('close', { rating: 'down', note: 'Too long' })]), block('b2', 5, [station('gone')])]),
    practice({ id: 'p3', blocks: [block('b1', 30, [station('warm')])] }),
  ];

  it('counts minutes and uses by drill and by tag, from finished practices only', () => {
    const stats = practiceStats(practices, DRILLS);
    expect(stats.practices).toBe(2);
    expect(stats.minutes).toBe(37);
    expect(stats.drills).toEqual([
      { drillId: 'shoot', name: 'Form shooting', uses: 2, minutes: 22, lastDate: '2026-11-03', up: 1, down: 0 },
      { drillId: 'close', name: 'Closeouts', uses: 2, minutes: 20, lastDate: '2026-11-10', up: 0, down: 1 },
      { drillId: 'gone', name: 'Deleted drill', uses: 1, minutes: 5, lastDate: '2026-11-10', up: 0, down: 0 },
    ]);
    expect(stats.tags).toEqual([
      { tag: 'Shooting', minutes: 22, percent: 59 },
      { tag: 'Defense', minutes: 20, percent: 54 },
      { tag: 'Untagged', minutes: 5, percent: 14 },
    ]);
  });

  it('collects a drill’s notes, newest first', () => {
    expect(drillNotes('close', practices)).toEqual([{ practiceId: 'p2', date: '2026-11-10', rating: 'down', note: 'Too long' }]);
    expect(drillNotes('shoot', practices)).toEqual([{ practiceId: 'p1', date: '2026-11-03', rating: 'up', note: '' }]);
  });
});

describe('shared texts', () => {
  const roster = [player('Avery'), player('Blake'), player('Casey')];
  const plan = practice({
    time: '18:00',
    focus: 'Defense',
    parentNote: 'Bring a water bottle.',
    teams: { A: ['Blake', 'Avery'], B: ['Casey'] },
    blocks: [
      block('b1', 8, [station('warm')]),
      block('b2', 12, [station('shoot', { coach: 'Coach Sam', group: 'A' }), station('close', { coach: 'Coach Lee', group: 'B' })]),
      block('b3', 2, [station('water')]),
      block('b4', 5, [station('shoot')], { skipped: true }),
    ],
  });

  it('formats times', () => {
    expect(formatTime('18:05')).toBe('6:05 PM');
    expect(formatTime('0:30')).toBe('12:30 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });

  it('writes the full plan for coaches', () => {
    const text = practicePlanText(plan, team, DRILLS, roster);
    expect(text).toContain('9U Comets practice · ');
    expect(text).toContain('6:00 PM · 22 min');
    expect(text).toContain('Focus: Defense\nCourt: full court');
    expect(text).toContain('6:00 PM · 8 min · Warm-up');
    expect(text).toContain('6:08 PM · 12 min · Stations at the same time:\n  • Form shooting · Coach Sam · Team A\n  • Closeouts · Coach Lee · Team B');
    expect(text).toContain('6:20 PM · 2 min · Water break');
    expect(text).toContain('Team A: Avery, Blake\nTeam B: Casey');
    expect(text).toContain('Bring: Basketballs, Whistle, Cones');
  });

  it('writes a station card with only that coach’s drills', () => {
    const text = stationCardText(plan, team, DRILLS, roster, 'coach sam');
    expect(text).toContain('6:08 PM · 12 min · Form shooting\n  Team A: Avery, Blake\n  Needs: basketballs, Cones\n  Elbow in.');
    expect(text).not.toContain('Closeouts');
  });

  it('writes the parent one-pager without groups, breaks or coaching notes', () => {
    const text = parentText(plan, team, DRILLS);
    expect(text).toContain('What we’ll work on:\n• Warm-up\n• Form shooting\n• Closeouts\n\nBring a water bottle.');
    expect(text).not.toMatch(/Water break|Team A|Elbow|Coach Sam/);
  });

  it('counts minutes into practice when there is no start time', () => {
    expect(practicePlanText({ ...plan, time: '' }, team, DRILLS, roster)).toContain('0:08 · 12 min');
  });
});
