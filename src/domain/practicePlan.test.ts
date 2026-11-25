import { describe, expect, it } from 'vitest';
import type { Drill, Player, Practice, PracticeBlock, Station, Team } from '../data/types';
import { indexDrills } from './practice';
import { coachesPlan, coachesPlanText, planText } from './practicePlan';

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
const station = (drillId: string, fields: Partial<Station> = {}): Station => ({
  drillId,
  coach: '',
  group: 'all',
  ...fields,
});
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
  date: '2026-11-28',
  time: '18:00',
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
const player = (id: string): Player => ({
  id,
  createdAt: 0,
  updatedAt: 0,
  teamId: 't1',
  name: id,
  number: '',
  skills: {},
  active: true,
});
const team = {
  id: 't1',
  name: '9U Comets',
  alwaysBring: ['Basketballs', 'Whistle'],
} as Team;

const DRILLS = indexDrills([
  drill('warm', {
    name: 'Warm-up',
    court: 'full',
    equipment: ['Cones'],
    notes: 'Jog, then stretch.\nKeep it easy.',
  }),
  drill('shoot', {
    name: 'Form shooting',
    equipment: ['basketballs', 'Cones'],
    notes: 'Elbow in. Video: https://example.com/form.',
  }),
  drill('close', { name: 'Closeouts', equipment: ['Cones'] }),
  drill('post', { name: 'Post work', notes: 'Seal early.' }),
  drill('guard', { name: 'Guard work' }),
  drill('pass', {
    name: 'Passing',
    equipment: ['Balls'],
    notes: 'Chest pass.',
  }),
]);
const roster = ['Avery', 'Blake', 'Casey', 'Drew'].map(player);

describe('coaches’ plan', () => {
  const plan = practice({
    focus: 'Defense',
    attending: ['Avery', 'Blake', 'Casey', 'Drew'],
    teams: { A: ['Blake', 'Avery'], B: ['Casey', 'Drew'] },
    blocks: [
      block('b1', 8, [station('warm', { coach: 'Coach Sam' })]),
      block('b2', 12, [station('shoot', { coach: 'Coach Sam', group: 'A' }), station('close', { coach: 'Coach Lee', group: 'B' })]),
      block('b3', 5, [station('warm')], { skipped: true }),
      block('b4', 10, [
        station('post', {
          coach: 'Coach Sam',
          group: 'custom',
          players: ['Drew', 'Casey'],
        }),
        station('guard', { group: 'custom', players: ['Avery'] }),
      ]),
    ],
  });
  const text = coachesPlanText(plan, team, DRILLS, roster);

  it('starts with when, how long, the focus and the court', () => {
    const lines = text.split('\n');
    expect(lines[0]).toBe('9U Comets practice');
    expect(lines.slice(1, 4)).toEqual(['Sat, Nov 28, 6:00 PM · 30 min', 'Focus: Defense', 'Court: full court']);
  });

  it('gives each block’s clock times and length, leaving skipped blocks out', () => {
    expect(text).toContain('\n6:00–6:08 PM (8 min)\n');
    expect(text).toContain('\n6:08–6:20 PM (12 min)\n');
    expect(text).toContain('\n6:20–6:30 PM (10 min)\n');
    expect(text).not.toContain('(5 min)');
  });

  it('shows the coach, players, equipment and coaching points of a drill', () => {
    expect(text).toContain('Warm-up\n  Coach: Coach Sam\n  Players: Everyone\n  Needs: Cones\n  Jog, then stretch.\n  Keep it easy.\n');
  });

  it('groups stations that run at the same time under the block’s time', () => {
    expect(text).toContain(
      '6:08–6:20 PM (12 min)\n2 stations at the same time\n' +
        'Form shooting\n  Coach: Coach Sam\n  Players: Team A (Avery, Blake)\n  Needs: basketballs, Cones\n  Elbow in. Video: https://example.com/form.\n\n' +
        'Closeouts\n  Coach: Coach Lee\n  Players: Team B (Casey, Drew)\n  Needs: Cones\n',
    );
  });

  it('leaves the coach line out when no coach is named, and lists custom players', () => {
    expect(text).toContain('Post work\n  Coach: Coach Sam\n  Players: Casey, Drew\n  Seal early.\n');
    expect(text).toContain('Guard work\n  Players: Avery\n');
    expect(text).not.toMatch(/Guard work\n {2}Coach/);
  });

  it('ends with the scrimmage teams and what to bring', () => {
    expect(text).toMatch(/Scrimmage teams\nTeam A: Avery, Blake\nTeam B: Casey, Drew\n\nBring\nBasketballs, Whistle, Cones\n$/);
  });

  it('keeps a web link whole, with only its own punctuation after it', () => {
    expect(text).toContain('  Elbow in. Video: https://example.com/form.\n');
  });

  it('says so when players are not picked or teams not split', () => {
    const p = practice({
      blocks: [block('b', 10, [station('post', { group: 'custom' }), station('guard', { group: 'A' })])],
    });
    const t = coachesPlanText(p, team, DRILLS, roster);
    expect(t).toContain('Players: no players picked');
    expect(t).toContain('Players: Team A (not split yet)');
    expect(t).not.toContain('Scrimmage teams');
  });

  it('counts minutes into practice with no start time, and names a deleted drill', () => {
    const p = practice({
      time: '',
      blocks: [block('a', 8, [station('warm')]), block('b', 7, [station('gone')])],
    });
    const t = coachesPlanText(p, team, DRILLS, roster);
    expect(t).toContain('\n0:00–0:08 (8 min)\n');
    expect(t).toContain('\n0:08–0:15 (7 min)\nDeleted drill\n  Players: Everyone\n');
  });

  it('shows the half court and the bare minimum for an empty plan', () => {
    const t = coachesPlanText(practice({ blocks: [] }), team, DRILLS, roster);
    expect(t).toContain('Court: half court is enough');
    expect(t).toContain('Bring\nBasketballs, Whistle\n');
  });

  it('writes AM and PM when a block crosses noon', () => {
    const p = practice({
      time: '11:55',
      blocks: [block('a', 10, [station('warm')])],
    });
    expect(coachesPlanText(p, team, DRILLS, roster)).toContain('11:55 AM–12:05 PM (10 min)');
  });

  it('models the same document the text draws', () => {
    const items = coachesPlan(plan, team, DRILLS, roster);
    expect(items[0]).toEqual({ kind: 'title', text: '9U Comets practice' });
    expect(items.filter((i) => i.kind === 'time').map((i) => i.text)).toEqual(['6:00–6:08 PM (8 min)', '6:08–6:20 PM (12 min)', '6:20–6:30 PM (10 min)']);
    expect(planText(items)).toBe(text);
  });
});

describe('coaches’ plan with rotating stations (PR4b)', () => {
  const rotating = practice({
    attending: ['Avery', 'Blake', 'Casey', 'Drew'],
    teams: { A: ['Avery', 'Blake'], B: ['Casey', 'Drew'] },
    blocks: [
      block(
        'r',
        12,
        [station('post', { coach: 'Coach Sam', group: 'A' }), station('guard', { coach: 'Coach Lee', group: 'B' }), station('pass', { group: 'all' })],
        {
          rotate: true,
        },
      ),
    ],
  });
  const text = coachesPlanText(rotating, team, DRILLS, roster);

  it('lists each rotation with its times and who is at each station', () => {
    expect(text).toContain('6:00–6:12 PM (12 min)\n3 stations, rotating: each group moves to the next station\n');
    expect(text).toContain(
      'Rotation 1: 6:00–6:04 PM (4 min)\n' +
        'Post work\n  Coach: Coach Sam\n  Players: Team A (Avery, Blake)\n' +
        'Guard work\n  Coach: Coach Lee\n  Players: Team B (Casey, Drew)\n' +
        'Passing\n  Players: Everyone\n',
    );
    // Coaches stay; the groups move one station on each rotation.
    expect(text).toContain(
      'Rotation 2: 6:04–6:08 PM (4 min)\nPost work\n  Coach: Coach Sam\n  Players: Everyone\nGuard work\n  Coach: Coach Lee\n  Players: Team A (Avery, Blake)\n',
    );
    expect(text).toContain('Rotation 3: 6:08–6:12 PM (4 min)\nPost work\n  Coach: Coach Sam\n  Players: Team B (Casey, Drew)\n');
  });

  it('describes each drill once for the block, not once per rotation', () => {
    expect(text).toContain('About these drills\nPost work\n  Seal early.\nPassing\n  Needs: Balls\n  Chest pass.\n');
    expect(text.split('Seal early.').length - 1).toBe(1);
    expect(text).not.toMatch(/About these drills[\s\S]*Guard work\n {2}\S/);
  });

  it('moves hand-picked players with their group, and splits odd lengths to the second', () => {
    const p = practice({
      attending: ['Avery', 'Blake'],
      blocks: [
        block(
          'r',
          10,
          [
            station('post', { group: 'custom', players: ['Avery'] }),
            station('guard', { group: 'custom', players: ['Blake'] }),
            station('pass', { group: 'custom' }),
          ],
          {
            rotate: true,
          },
        ),
      ],
    });
    const t = coachesPlanText(p, team, DRILLS, roster);
    expect(t).toContain('Rotation 1: 6:00–6:03 PM (3 min 20 sec)');
    expect(t).toContain('Rotation 2: 6:03–6:07 PM (3 min 20 sec)');
    expect(t).toContain('Rotation 3: 6:07–6:10 PM (3 min 20 sec)');
    expect(t).toContain('Rotation 2: 6:03–6:07 PM (3 min 20 sec)\nPost work\n  Players: no players picked\nGuard work\n  Players: Avery\n');
  });

  it('shows a one-station “rotating” block like any other', () => {
    const p = practice({
      blocks: [block('r', 10, [station('post')], { rotate: true })],
    });
    expect(coachesPlanText(p, team, DRILLS, roster)).not.toContain('Rotation');
  });
});
