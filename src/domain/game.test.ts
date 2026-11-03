import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, DEFAULT_RULES } from '../data/defaults';
import type { Game, Player, Team } from '../data/types';
import {
  describeError,
  describeWarning,
  nextSegment,
  planGame,
  playingTime,
  segmentCount,
  segmentLabel,
  startGame,
  undoSegment,
} from './game';

const team: Team = {
  id: 't',
  name: 'Team',
  positions: DEFAULT_POSITIONS,
  requirement: { G: 2 },
  defaultFormat: { periodType: 'quarters', segmentsPerPeriod: 2 },
  defaultRules: DEFAULT_RULES,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
};

const roster: Player[] = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  teamId: 't',
  name: `Player ${i + 1}`,
  number: String(i),
  skills: i < 4 ? { G: 2 } : { F: 2 },
  active: true,
  createdAt: 0,
  updatedAt: 0,
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g',
    teamId: 't',
    date: '2026-11-07',
    opponent: '',
    attending: roster.map((p) => p.id),
    format: { periodType: 'quarters', segmentsPerPeriod: 2 },
    rules: DEFAULT_RULES,
    plan: [],
    warnings: [],
    seed: 1,
    status: 'planned',
    current: 0,
    played: [],
    subbedOut: [],
    statuses: {},
    events: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function plannedGame(): Game {
  const game = makeGame();
  const outcome = planGame(game, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  return { ...game, plan: outcome.plan, warnings: outcome.warnings };
}

describe('format and labels', () => {
  it('counts segments for quarters and halves', () => {
    expect(segmentCount({ periodType: 'quarters', segmentsPerPeriod: 2 })).toBe(8);
    expect(segmentCount({ periodType: 'halves', segmentsPerPeriod: 4 })).toBe(8);
    expect(segmentCount({ periodType: 'halves', segmentsPerPeriod: 1 })).toBe(2);
  });

  it('labels segments by period', () => {
    const quarters = { periodType: 'quarters' as const, segmentsPerPeriod: 2 };
    expect(segmentLabel(quarters, 0).text).toBe('Q1 · 1 of 2');
    expect(segmentLabel(quarters, 3).text).toBe('Q2 · 2 of 2');
    expect(segmentLabel({ periodType: 'halves', segmentsPerPeriod: 1 }, 1).text).toBe('H2');
    expect(segmentLabel(quarters, 8).text).toBe('OT1');
  });
});

describe('planGame', () => {
  it('plans only attending players and covers the requirement', () => {
    const game = makeGame({ attending: roster.slice(0, 7).map((p) => p.id) });
    const outcome = planGame(game, team, roster);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan).toHaveLength(8);
    expect(outcome.plan.flat().some((s) => s.playerId === 'p8')).toBe(false);
    for (const lineup of outcome.plan) expect(lineup.filter((s) => s.positionId === 'G').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps played segments when regenerating mid-game', () => {
    let game = startGame(plannedGame());
    game = nextSegment(nextSegment(game));
    const outcome = planGame(game, team, roster, 42);
    expect(outcome.ok && outcome.plan.slice(0, 2)).toEqual(game.played);
  });

  it('reports why a plan is impossible', () => {
    const game = makeGame({ attending: ['p1', 'p2', 'p3'] });
    const outcome = planGame(game, team, roster);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(describeError(outcome.error, game, team.positions)).toMatch(/Only 3 players/);
  });
});

describe('describeError and describeWarning', () => {
  const game = makeGame();
  const names = new Map([
    ['p1', 'Ava'],
    ['p2', 'Bo'],
  ]);

  it('explains each error kind in plain language', () => {
    expect(describeError({ kind: 'requirement-too-large', total: 6 }, game, team.positions)).toMatch(/adds up to 6/);
    expect(describeError({ kind: 'positions-uncoverable', segment: 2, missing: ['C'] }, game, team.positions)).toMatch(
      /play Center \(needed from Q2 · 1 of 2\)/,
    );
  });

  it('explains each warning kind in plain language', () => {
    expect(describeWarning({ kind: 'equal-time', most: ['p1'], fewest: ['p2'], spread: 2 }, game, names)).toMatch(
      /Ava plays 2 more segments than Bo/,
    );
    expect(
      describeWarning({ kind: 'bench-streak', playerId: 'p2', startSegment: 0, length: 2, limit: 1 }, game, names),
    ).toBe('Bo sits 2 segments in a row starting Q1 · 1 of 2 (the limit is 1).');
    expect(describeWarning({ kind: 'skill-stack', segment: 1 }, game, names)).toMatch(/Q1 · 2 of 2/);
    expect(describeWarning({ kind: 'bench-streak', playerId: 'zz', startSegment: 0, length: 2, limit: 1 }, game, names)).toMatch(
      /Unknown player/,
    );
  });
});

describe('running a game', () => {
  it('Next records the lineup on the court and advances', () => {
    let game = startGame(plannedGame());
    expect(game).toMatchObject({ status: 'live', current: 0, played: [] });
    game = nextSegment(game);
    expect(game.current).toBe(1);
    expect(game.played).toEqual([game.plan[0]]);
  });

  it('Next on the last segment ends the game', () => {
    let game = startGame(plannedGame());
    for (let i = 0; i < 8; i++) game = nextSegment(game);
    expect(game.status).toBe('final');
    expect(game.played).toHaveLength(8);
    expect(nextSegment(game)).toBe(game);
  });

  it('Undo reverses Next, including reopening a finished game', () => {
    let game = startGame(plannedGame());
    expect(undoSegment(game)).toBe(game);
    game = nextSegment(nextSegment(game));
    game = undoSegment(game);
    expect(game.current).toBe(1);
    expect(game.played).toHaveLength(1);
    for (let i = 0; i < 7; i++) game = nextSegment(game);
    expect(game.status).toBe('final');
    game = undoSegment(game);
    expect(game).toMatchObject({ status: 'live', current: 7 });
  });

  it('Next does nothing before the game starts', () => {
    const game = plannedGame();
    expect(nextSegment(game)).toBe(game);
    expect(nextSegment({ ...startGame(game), plan: [] })).toMatchObject({ played: [] });
  });

  it('reports planned and played segments per player', () => {
    let game = startGame(plannedGame());
    game = nextSegment(game);
    const time = playingTime(game);
    expect(time.reduce((sum, t) => sum + t.planned, 0)).toBe(40);
    expect(time.reduce((sum, t) => sum + t.played, 0)).toBe(5);
  });
});
