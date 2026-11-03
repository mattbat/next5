import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, DEFAULT_RULES } from '../data/defaults';
import type { Game, Player, Team } from '../data/types';
import { replan } from './changes';
import { activeLocks, describeError, planGame, startGame } from './game';
import {
  clearLocks,
  isLineupLocked,
  lockLineup,
  lockOf,
  segmentLocks,
  setLock,
  shuffleFrom,
  swapInPlan,
  unlock,
  unlockSegment,
} from './planning';

const team: Team = {
  id: 't',
  name: 'Team',
  positions: DEFAULT_POSITIONS,
  requirement: { G: 2, C: 1 },
  defaultFormat: { periodType: 'quarters', segmentsPerPeriod: 2 },
  defaultRules: DEFAULT_RULES,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
};

// p1–p4 guards, p5–p6 centers, p7–p10 forwards; p11 is on the roster but not attending.
const roster: Player[] = Array.from({ length: 11 }, (_, i) => ({
  id: `p${i + 1}`,
  teamId: 't',
  name: `Player ${i + 1}`,
  number: String(i + 1),
  skills: i < 4 ? { G: 2 } : i < 6 ? { C: 2 } : { F: 2 },
  active: true,
  createdAt: 0,
  updatedAt: 0,
}));

function plannedGame(): Game {
  const game: Game = {
    id: 'g',
    teamId: 't',
    date: '2026-11-07',
    opponent: '',
    attending: roster.slice(0, 10).map((p) => p.id),
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
    locks: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const outcome = planGame(game, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  return { ...game, plan: outcome.plan, warnings: outcome.warnings };
}

const onCourt = (game: Game, segment: number, id: string) => game.plan[segment]!.some((s) => s.playerId === id);
const benchAt = (game: Game, segment: number) => game.attending.filter((id) => !onCourt(game, segment, id));
const unwrap = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe('locks (G6) with auto-fill (G7)', () => {
  it('locking out a player on the court brings in a replacement', () => {
    const game = plannedGame();
    const out = game.plan[2]![0]!.playerId;
    const edit = unwrap(setLock(game, team, roster, 2, out, 'out'));
    expect(onCourt(edit.game, 2, out)).toBe(false);
    expect(edit.changed).toContain(2);
    expect(lockOf(edit.game, 2, out)).toBe('out');
    expect(edit.game.plan[2]).toHaveLength(5);
  });

  it('locking in a player on the bench puts them on the court', () => {
    const game = plannedGame();
    const sitter = benchAt(game, 3)[0]!;
    const edit = unwrap(setLock(game, team, roster, 3, sitter, 'in'));
    expect(onCourt(edit.game, 3, sitter)).toBe(true);
    expect(lockOf(edit.game, 3, sitter)).toBe('in');
  });

  it("doesn't change the plan when it already meets the new lock", () => {
    const game = plannedGame();
    const player = game.plan[0]![0]!.playerId;
    const edit = unwrap(setLock(game, team, roster, 0, player, 'in'));
    expect(edit.game.plan).toBe(game.plan);
    expect(edit.changed).toEqual([]);
  });

  it('replaces an earlier lock on the same player and segment', () => {
    const game = plannedGame();
    const player = game.plan[1]![0]!.playerId;
    const locked = unwrap(setLock(game, team, roster, 1, player, 'in')).game;
    const flipped = unwrap(setLock(locked, team, roster, 1, player, 'out')).game;
    expect(flipped.locks).toEqual([{ segment: 1, playerId: player, kind: 'out' }]);
  });

  it('explains when a lock would make the plan impossible', () => {
    // Locking out both centers leaves nobody to play Center.
    let game = plannedGame();
    game = { ...game, locks: [{ segment: 4, playerId: 'p5', kind: 'out' }] };
    const result = setLock(game, team, roster, 4, 'p6', 'out');
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/nobody left can play Center/) });
  });

  it('keeps locks when the whole plan is regenerated (G8)', () => {
    const game = { ...plannedGame(), locks: [{ segment: 5, playerId: 'p10', kind: 'in' as const }] };
    const outcome = planGame({ ...game, plan: [] }, team, roster, 9);
    expect(outcome.ok && outcome.plan[5]!.some((s) => s.playerId === 'p10')).toBe(true);
  });

  it('keeps future locks when re-planning during a game (D6)', () => {
    const game = startGame({ ...plannedGame(), locks: [{ segment: 6, playerId: 'p1', kind: 'out' }] });
    const preview = unwrap(replan(game, team, roster, 4));
    expect(preview.game.plan[6]!.some((s) => s.playerId === 'p1')).toBe(false);
  });

  it('ignores locks for players who are no longer attending', () => {
    const game = { ...plannedGame(), locks: [{ segment: 0, playerId: 'p11', kind: 'in' as const }] };
    expect(activeLocks(game, game.plan.length)).toEqual([]);
    expect(segmentLocks(game, 0)).toEqual([]);
  });
});

describe('locking and unlocking', () => {
  it('locks and unlocks a whole lineup', () => {
    const game = plannedGame();
    const locked = lockLineup(game, 7);
    expect(isLineupLocked(locked, 7)).toBe(true);
    expect(isLineupLocked(locked, 6)).toBe(false);
    expect(segmentLocks(locked, 7)).toHaveLength(5);
    expect(locked.plan).toBe(game.plan);
    expect(unlockSegment(locked, 7).locks).toEqual([]);
  });

  it('unlocks one player, or every lock in the game, without changing the plan', () => {
    const game = lockLineup(lockLineup(plannedGame(), 0), 1);
    const player = game.plan[0]![0]!.playerId;
    const one = unlock(game, 0, player);
    expect(lockOf(one, 0, player)).toBeNull();
    expect(one.locks).toHaveLength(9);
    expect(one.plan).toBe(game.plan);
    expect(clearLocks(game).locks).toEqual([]);
  });
});

describe('swap in the plan (G9)', () => {
  it('swaps a bench player in and keeps the swap as locks', () => {
    const game = plannedGame();
    const out = game.plan[1]!.find((s) => s.positionId === 'F')!.playerId;
    const inId = benchAt(game, 1).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const edit = unwrap(swapInPlan(game, team, roster, 1, out, inId));
    expect(onCourt(edit.game, 1, inId)).toBe(true);
    expect(onCourt(edit.game, 1, out)).toBe(false);
    expect(lockOf(edit.game, 1, inId)).toBe('in');
    expect(lockOf(edit.game, 1, out)).toBe('out');
    // The other four stay on the court.
    const stayed = game.plan[1]!.filter((s) => s.playerId !== out).map((s) => s.playerId);
    expect(stayed.every((id) => onCourt(edit.game, 1, id))).toBe(true);
  });

  it('blocks a swap that leaves a required position uncovered (H1)', () => {
    const game = plannedGame();
    const center = game.plan[0]!.find((s) => s.positionId === 'C')!.playerId;
    const otherCenter = center === 'p5' ? 'p6' : 'p5';
    const nonCenter = benchAt(game, 0).find((id) => id !== otherCenter)!;
    expect(swapInPlan(game, team, roster, 0, center, nonCenter)).toEqual({
      ok: false,
      message: expect.stringMatching(/Pick someone who plays Center/),
    });
  });

  it('allows that swap when position coverage is off', () => {
    const game = { ...plannedGame(), rules: { ...DEFAULT_RULES, positionCoverage: false } };
    const center = game.plan[0]!.find((s) => s.positionId === 'C')!.playerId;
    const nonCenter = benchAt(game, 0).find((id) => !['p5', 'p6'].includes(id))!;
    expect(swapInPlan(game, team, roster, 0, center, nonCenter).ok).toBe(true);
  });

  it('refuses players who are not where the swap expects them', () => {
    const game = plannedGame();
    const sitter = benchAt(game, 0)[0]!;
    const playing = game.plan[0]![0]!.playerId;
    expect(swapInPlan(game, team, roster, 0, sitter, playing)).toMatchObject({ ok: false, message: /isn't on the court/ });
    expect(swapInPlan(game, team, roster, 0, playing, game.plan[0]![1]!.playerId)).toMatchObject({
      ok: false,
      message: /can't come in/,
    });
    expect(swapInPlan(game, team, roster, 0, playing, 'p11')).toMatchObject({ ok: false });
  });

  it('reports rules a swap breaks, so the screen can confirm it', () => {
    // Locking p1 into every segment means a swap bringing p1 in can't be balanced out.
    let game = plannedGame();
    game = { ...game, rules: { ...DEFAULT_RULES, positionCoverage: false } };
    for (let s = 0; s < 8; s++) {
      if (!onCourt(game, s, 'p1')) {
        const out = game.plan[s]![0]!.playerId;
        game = unwrap(swapInPlan(game, team, roster, s, out, 'p1')).game;
      }
    }
    expect(game.warnings.some((w) => w.kind === 'equal-time')).toBe(true);
    // A further swap that adds a new problem reports it.
    const sitter = benchAt(game, 0).find((id) => id !== 'p1')!;
    const keeper = game.plan[0]!.find((s) => s.playerId !== 'p1')!.playerId;
    const edit = unwrap(swapInPlan({ ...game, warnings: [] }, team, roster, 0, keeper, sitter));
    expect(edit.newWarnings.length).toBeGreaterThan(0);
  });
});

describe('regenerate from a segment (G8)', () => {
  it('keeps the segments before it and every lock, and shuffles the rest', () => {
    const game = lockLineup(plannedGame(), 6);
    const edit = unwrap(shuffleFrom(game, team, roster, 3));
    expect(edit.game.plan.slice(0, 3)).toEqual(game.plan.slice(0, 3));
    expect(edit.game.plan[6]!.map((s) => s.playerId).sort()).toEqual(game.plan[6]!.map((s) => s.playerId).sort());
    expect(edit.game.seed).toBe(game.seed + 1);
    expect(edit.changed.every((s) => s >= 3)).toBe(true);
  });
});

describe('lock errors in plain language (H-5)', () => {
  const game = plannedGame();
  it.each([
    [{ kind: 'too-many-locked-out' as const, segment: 2, available: 4 }, /Too many players are locked out of Q2 · 1/],
    [{ kind: 'too-many-locked-in' as const, segment: 0, count: 6 }, /6 players are locked in for Q1 · 1/],
    [{ kind: 'locks-uncoverable' as const, segment: 7, missing: ['C'] }, /locks in Q4 · 2 of 2, nobody left can play Center/],
  ])('explains %o', (error, message) => {
    expect(describeError(error, game, DEFAULT_POSITIONS)).toMatch(message);
  });
});
