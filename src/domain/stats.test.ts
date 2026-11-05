import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, DEFAULT_RULES } from '../data/defaults';
import type { Game, Player } from '../data/types';
import type { Lineup } from '../engine';
import { gameStats, gameStatsCsv, seasonStats, seasonStatsCsv } from './stats';

const player = (i: number, overrides: Partial<Player> = {}): Player => ({
  id: `p${i}`,
  teamId: 't',
  name: `Player ${i}`,
  number: String(i),
  skills: { G: 3 },
  active: true,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const players = Array.from({ length: 7 }, (_, i) => player(i + 1));

/** A lineup of these players, all at the given position. */
const five = (ids: number[], positionId: string | null = 'G'): Lineup => ids.map((i) => ({ playerId: `p${i}`, positionId }));

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g',
    teamId: 't',
    date: '2026-11-07',
    opponent: 'Rockets',
    attending: players.slice(0, 6).map((p) => p.id),
    format: { periodType: 'quarters', segmentsPerPeriod: 1 },
    rules: DEFAULT_RULES,
    plan: [],
    warnings: [],
    seed: 1,
    status: 'final',
    current: 3,
    played: [],
    subbedOut: [],
    statuses: {},
    events: [],
    locks: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// p6 sits segment 0; p1 sits segment 1; p2 is subbed out partway through 2 for p6.
const played: Lineup[] = [
  five([1, 2, 3, 4, 5]),
  [...five([2, 3, 4, 5], 'F'), { playerId: 'p6', positionId: 'C' }],
  [...five([1, 3, 4, 5]), { playerId: 'p6', positionId: 'C' }, { playerId: 'p2', positionId: 'G' }],
  five([1, 2, 3, 4, 6]),
];

describe('gameStats (S3)', () => {
  const stats = new Map(gameStats(game({ played, plan: played, startPlan: played.slice(0, 2) })).map((s) => [s.playerId, s]));

  it('counts segments played, sat and planned', () => {
    expect(stats.get('p1')).toMatchObject({ planned: 1, played: 3, sat: 1 });
    expect(stats.get('p6')).toMatchObject({ planned: 1, played: 3, sat: 1 });
  });

  it('credits both players in a mid-segment swap', () => {
    expect(stats.get('p2')).toMatchObject({ played: 4, sat: 0 });
  });

  it('counts the positions played', () => {
    expect(stats.get('p6')!.byPosition).toEqual({ C: 2, G: 1 });
    expect(stats.get('p3')!.byPosition).toEqual({ G: 3, F: 1 });
  });

  it('uses the final plan when the game has no start plan', () => {
    const old = new Map(gameStats(game({ played, plan: played })).map((s) => [s.playerId, s]));
    expect(old.get('p2')!.planned).toBe(4);
  });

  it("doesn't count segments a player couldn't play as sat", () => {
    // p1 sat segment 1 while marked out, so it isn't counted against them.
    const injured = game({ played, statuses: { p1: { kind: 'resting', from: 1, until: 2 } } });
    expect(gameStats(injured).find((s) => s.playerId === 'p1')).toMatchObject({ played: 3, sat: 0 });
    const late = game({ played, statuses: { p6: { kind: 'arrived', at: 1 } } });
    expect(gameStats(late).find((s) => s.playerId === 'p6')).toMatchObject({ played: 3, sat: 0 });
  });

  it('skips positions for players shown without one', () => {
    const plain = game({ played: [five([1, 2, 3, 4, 5], null)] });
    expect(gameStats(plain).find((s) => s.playerId === 'p1')!.byPosition).toEqual({});
  });
});

describe('seasonStats (S4)', () => {
  const second = game({ id: 'g2', played: [five([1, 2, 3, 4, 7])], attending: ['p1', 'p2', 'p3', 'p4', 'p7'] });
  const unfinished = game({ id: 'g3', status: 'live', played: [five([1, 2, 3, 4, 5])] });

  it('adds up finished games only', () => {
    const rows = new Map(seasonStats([game({ played }), second, unfinished], players).map((s) => [s.playerId, s]));
    expect(rows.get('p1')).toMatchObject({ games: 2, played: 4, available: 5, percent: 80 });
    expect(rows.get('p5')).toMatchObject({ games: 1, played: 3, available: 4, percent: 75 });
    expect(rows.get('p7')).toMatchObject({ games: 1, played: 1, available: 1, percent: 100 });
    expect(rows.get('p3')!.byPosition).toEqual({ G: 4, F: 1 });
  });

  it('lists every active player, with no percentage before they play', () => {
    const rows = seasonStats([], players);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ playerId: 'p1', games: 0, played: 0, available: 0, percent: null, byPosition: {} });
  });

  it('keeps inactive players who played, drops those who did not and players no longer on the roster', () => {
    const roster = [...players.slice(0, 6), player(7, { active: false }), player(8, { active: false })];
    const ids = seasonStats([second], roster).map((s) => s.playerId);
    expect(ids).toContain('p7');
    expect(ids).not.toContain('p8');
    expect(seasonStats([second], players.slice(0, 3)).map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts by name', () => {
    const roster = [player(1, { name: 'Zoe' }), player(2, { name: 'Ava' })];
    expect(seasonStats([], roster).map((s) => s.playerId)).toEqual(['p2', 'p1']);
  });
});

describe('CSV export (S5)', () => {
  const lines = (csv: string) => csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');

  it('exports a game with one row per player, without skill levels', () => {
    const csv = gameStatsCsv(game({ played, plan: played }), players, DEFAULT_POSITIONS);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const rows = lines(csv);
    expect(rows[0]).toBe('Player,Number,Planned segments,Segments played,Segments sat,Guard,Forward,Center');
    expect(rows[1]).toBe('Player 1,1,3,3,1,3,0,0');
    expect(rows).toHaveLength(7);
    expect(csv).not.toMatch(/Rising|Steady|Go-To|skill/i);
  });

  it('exports the season', () => {
    const rows = lines(seasonStatsCsv([game({ played })], players, DEFAULT_POSITIONS));
    expect(rows[0]).toBe('Player,Number,Games,Segments played,Segments available,% played,Guard,Forward,Center');
    expect(rows[1]).toBe('Player 1,1,1,3,4,75,3,0,0');
    expect(rows[7]).toBe('Player 7,7,0,0,0,,0,0,0');
  });

  it('quotes names with commas or quotes', () => {
    const roster = [player(1, { name: 'Lee, "Jo"' })];
    expect(lines(seasonStatsCsv([], roster, DEFAULT_POSITIONS))[1]).toBe('"Lee, ""Jo""",1,0,0,0,,0,0,0');
  });
});
