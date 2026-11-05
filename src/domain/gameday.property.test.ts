/**
 * Property test for game day (G1): random rosters run random sequences of
 * everything a coach can do during a game (Next, Undo, swaps now and next,
 * injuries, rests, late arrivals, re-plans, overtime, ending early), and the
 * game must stay sound after every step.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS } from '../data/defaults';
import type { Game, Player, Team } from '../data/types';
import type { Lineup } from '../engine';
import {
  addSegments,
  availableAt,
  benchFor,
  markArrived,
  planConflicts,
  replan,
  setStatus,
  swapNext,
  swapNow,
} from './changes';
import { endGameEarly, nextSegment, planGame, startGame, undoSegment } from './game';
import { gameStats } from './stats';

const positionIds = ['G', 'F', 'C'] as const;

const playerArb = fc
  .subarray([...positionIds], { minLength: 1 })
  .chain((positions) =>
    fc.tuple(...positions.map(() => fc.constantFrom(1 as const, 2 as const, 3 as const))).map((levels) =>
      Object.fromEntries(positions.map((p, i) => [p, levels[i]])),
    ),
  );

const setupArb = fc.record({
  skills: fc.array(playerArb, { minLength: 6, maxLength: 11 }),
  absent: fc.integer({ min: 0, max: 2 }),
  requirement: fc.constantFrom({}, { G: 1 }, { G: 2, C: 1 }, { G: 1, F: 1, C: 1 }),
  rules: fc.record({
    positionCoverage: fc.boolean(),
    equalTime: fc.boolean(),
    limitBench: fc.boolean(),
    balanceSkill: fc.boolean(),
  }),
  periodType: fc.constantFrom('quarters' as const, 'halves' as const),
  seed: fc.integer(),
});

const actionArb = fc.record({
  kind: fc.constantFrom(
    'next',
    'next',
    'next',
    'undo',
    'swapNow',
    'swapNext',
    'injure',
    'rest',
    'available',
    'arrive',
    'replan',
    'overtime',
    'endEarly',
  ),
  a: fc.nat(),
  b: fc.nat(),
  n: fc.integer({ min: 1, max: 3 }),
});

type Action = typeof actionArb extends fc.Arbitrary<infer T> ? T : never;

const ids = (lineup: Lineup | undefined) => (lineup ?? []).map((s) => s.playerId);
const pick = <T,>(items: T[], i: number): T | undefined => (items.length === 0 ? undefined : items[i % items.length]);

/** Applies one coach action, the way the screens do. Actions that don't apply leave the game as it is. */
function apply(game: Game, action: Action, team: Team, roster: Player[]): Game {
  if (action.kind === 'undo') return undoSegment(game);
  if (game.status !== 'live') return game;
  const onCourt = ids(game.plan[game.current]);
  const attending = game.attending;
  switch (action.kind) {
    case 'next':
      return nextSegment(game);
    case 'swapNow': {
      const out = pick(onCourt, action.a);
      const into = pick(benchFor(game, game.current), action.b);
      if (!out || !into) return game;
      const result = swapNow(game, team, roster, out, into);
      return result.ok ? result.game : game; // Swap anyway: warnings never block.
    }
    case 'swapNext': {
      const next = ids(game.plan[game.current + 1]);
      const out = pick(next, action.a);
      const into = pick(benchFor(game, game.current + 1), action.b);
      if (!out || !into) return game;
      const result = swapNext(game, team, roster, out, into);
      return result.ok ? result.game : game;
    }
    case 'injure':
      return setStatus(game, pick(attending, action.a)!, { kind: 'out' });
    case 'rest':
      return setStatus(game, pick(attending, action.a)!, { kind: 'resting', segments: action.n });
    case 'available':
      return setStatus(game, pick(attending, action.a)!, null);
    case 'arrive': {
      const absent = roster.filter((p) => !attending.includes(p.id));
      const player = pick(absent, action.a);
      return player ? markArrived(game, player.id) : game;
    }
    case 'replan': {
      const result = replan(game, team, roster);
      return result.ok ? result.game : game;
    }
    case 'overtime': {
      const result = addSegments(game, team, roster);
      return result.ok ? result.game : game;
    }
    case 'endEarly':
      return endGameEarly(game);
  }
}

/** What must hold after every step. */
function checkGame(before: Game, after: Game, action: Action): void {
  // Played segments never change, except Undo taking back the last one (D3, D2).
  if (action.kind === 'undo') {
    expect(after.played).toEqual(before.played.slice(0, after.played.length));
    expect(after.played.length).toBeGreaterThanOrEqual(before.played.length - 1);
  } else {
    expect(after.played.slice(0, before.played.length)).toEqual(before.played);
  }

  // Every lineup from the current one on is five different players at this game.
  const from = after.status === 'final' ? after.plan.length : after.current;
  for (const lineup of after.plan.slice(from)) {
    expect(new Set(ids(lineup)).size).toBe(5);
    for (const id of ids(lineup)) expect(after.attending).toContain(id);
  }
  // Someone subbed out mid-segment isn't also on the court.
  if (after.status === 'live') {
    const court = new Set(ids(after.plan[after.current]));
    for (const slot of after.subbedOut) expect(court.has(slot.playerId)).toBe(false);
  }

  // Next then Undo puts everything back exactly.
  if (action.kind === 'next' && after !== before) {
    const undone = undoSegment(after);
    for (const key of ['plan', 'played', 'current', 'status', 'subbedOut', 'events'] as const) {
      expect(undone[key]).toEqual(before[key]);
    }
  }

  // A re-plan leaves nobody who can't play in an upcoming lineup, and keeps every remaining lock.
  if (action.kind === 'replan' && after !== before) {
    expect(planConflicts(after)).toEqual([]);
    for (const lock of after.locks) {
      if (lock.segment <= after.current || lock.segment >= after.plan.length) continue;
      if (!after.attending.includes(lock.playerId)) continue;
      const on = ids(after.plan[lock.segment]).includes(lock.playerId);
      if (lock.kind === 'out') expect(on).toBe(false);
      else if (availableAt(after.statuses[lock.playerId], lock.segment)) expect(on).toBe(true);
    }
  }

  // Stats add up: nobody plays more segments than were played, and every segment had at least five.
  const stats = gameStats(after);
  for (const s of stats) expect(s.played).toBeLessThanOrEqual(after.played.length);
  expect(stats.reduce((sum, s) => sum + s.played, 0)).toBeGreaterThanOrEqual(5 * after.played.length);
}

describe('game day stays sound under any sequence of changes (G1)', () => {
  it(
    'keeps played segments, full lineups, locks and Undo working',
    () => {
      fc.assert(
        fc.property(setupArb, fc.array(actionArb, { minLength: 8, maxLength: 30 }), (setup, actions) => {
          const team: Team = {
            id: 't',
            name: 'Team',
            positions: DEFAULT_POSITIONS,
            requirement: setup.requirement,
            defaultFormat: { periodType: setup.periodType, segmentsPerPeriod: 2 },
            defaultRules: setup.rules,
            archived: false,
            createdAt: 0,
            updatedAt: 0,
          };
          const roster: Player[] = setup.skills.map((skills, i) => ({
            id: `p${i}`,
            teamId: 't',
            name: `Player ${i}`,
            number: String(i),
            skills,
            active: true,
            createdAt: 0,
            updatedAt: 0,
          }));
          const attending = roster.slice(setup.absent).map((p) => p.id);
          const planned: Game = {
            id: 'g',
            teamId: 't',
            date: '2026-11-07',
            opponent: '',
            attending,
            format: team.defaultFormat,
            rules: setup.rules,
            plan: [],
            warnings: [],
            seed: setup.seed,
            status: 'planned',
            current: 0,
            played: [],
            subbedOut: [],
            statuses: {},
            events: [],
            locks: [],
            createdAt: 0,
            updatedAt: 0,
          };
          const outcome = planGame(planned, team, roster, setup.seed);
          if (!outcome.ok) return; // Rosters that can't cover the positions are explained elsewhere.

          let game = startGame({ ...planned, plan: outcome.plan });
          for (const action of actions) {
            const next = apply(game, action, team, roster);
            checkGame(game, next, action);
            game = next;
          }
        }),
        { numRuns: 100 },
      );
    },
    120_000,
  );
});
