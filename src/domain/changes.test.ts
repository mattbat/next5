import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, DEFAULT_RULES } from '../data/defaults';
import { upgradeGameV2 } from '../data/db';
import type { Game, Player, Team } from '../data/types';
import { analyzePlan, benchLimit } from '../engine';
import {
  addSegments,
  availableAt,
  benchFor,
  changedSegments,
  describeSwapWarning,
  markArrived,
  planConflicts,
  replan,
  setStatus,
  swapNext,
  swapNow,
  unavailableSegments,
} from './changes';
import { nextSegment, planGame, playingTime, startGame, toEnginePlayers, undoSegment } from './game';

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

function liveGame(): Game {
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
  return startGame({ ...game, plan: outcome.plan });
}

const ids = (lineup: { playerId: string }[] | undefined) => (lineup ?? []).map((s) => s.playerId).sort();
const onCourt = (game: Game, segment = game.current) => ids(game.plan[segment]);
const unwrap = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe('availability', () => {
  it('works out when each status allows a player to play', () => {
    expect(availableAt(undefined, 3)).toBe(true);
    expect([2, 3, 4].map((s) => availableAt({ kind: 'out', from: 3 }, s))).toEqual([true, false, false]);
    expect([2, 3, 4, 5].map((s) => availableAt({ kind: 'resting', from: 3, until: 5 }, s))).toEqual([true, false, false, true]);
    expect([2, 3].map((s) => availableAt({ kind: 'arrived', at: 3 }, s))).toEqual([false, true]);
  });

  it('lists unavailable segments for the engine', () => {
    const game = { ...liveGame(), statuses: { p1: { kind: 'out' as const, from: 6 }, p2: { kind: 'arrived' as const, at: 1 } } };
    expect(unavailableSegments(game, 8)).toEqual({ p1: [6, 7], p2: [0] });
  });

  it('lists who is on the bench and available', () => {
    let game = liveGame();
    const bench = benchFor(game, 0);
    expect(bench).toHaveLength(5);
    game = setStatus(game, bench[0]!, { kind: 'out' });
    expect(benchFor(game, 1)).not.toContain(bench[0]);
  });
});

describe('swapNow', () => {
  it('replaces a player on the court and credits both for the segment', () => {
    const game = liveGame();
    const out = game.plan[0]!.find((s) => s.positionId === 'F')!.playerId;
    const into = benchFor(game, 0).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const swapped = unwrap(swapNow(game, team, roster, out, into)).game;
    expect(onCourt(swapped)).toContain(into);
    expect(onCourt(swapped)).not.toContain(out);
    expect(swapped.subbedOut.map((s) => s.playerId)).toEqual([out]);
    expect(swapped.events.at(-1)).toEqual({ kind: 'swap-now', segment: 0, out, in: into });

    const after = nextSegment(swapped);
    expect(ids(after.played[0])).toContain(out);
    expect(ids(after.played[0])).toContain(into);
    expect(after.subbedOut).toEqual([]);
    const time = new Map(playingTime(after).map((t) => [t.playerId, t.played]));
    expect(time.get(out)).toBe(1);
    expect(time.get(into)).toBe(1);
  });

  it('allows a swap that leaves a required position uncovered, with a warning', () => {
    const game = liveGame();
    const center = game.plan[0]!.find((s) => s.positionId === 'C')!.playerId;
    const forward = benchFor(game, 0).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const result = unwrap(swapNow(game, team, roster, center, forward));
    expect(onCourt(result.game)).toContain(forward);
    expect(result.warnings).toContainEqual({ kind: 'uncovered', positions: ['C'] });
    // The forward keeps playing forward; nobody is shown at Center.
    expect(result.game.plan[0]!.find((s) => s.playerId === forward)!.positionId).toBe('F');
    expect(describeSwapWarning(result.warnings[0]!, result.game, team.positions, new Map())).toBe(
      'Nobody on the court is covering Center.',
    );
  });

  it('gives the incoming player the leaving player’s position when they can play it', () => {
    const game = liveGame();
    const center = game.plan[0]!.find((s) => s.positionId === 'C')!.playerId;
    const otherCenter = benchFor(game, 0).find((id) => roster.find((p) => p.id === id)!.skills.C);
    if (!otherCenter) return;
    const result = unwrap(swapNow(game, team, roster, center, otherCenter));
    expect(result.warnings).toEqual([]);
    expect(result.game.plan[0]!.find((s) => s.playerId === otherCenter)!.positionId).toBe('C');
  });

  it('does not warn about uncovered positions when position coverage is off', () => {
    const game = { ...liveGame(), rules: { ...DEFAULT_RULES, positionCoverage: false } };
    const center = game.plan[0]!.find((s) => s.positionId === 'C')!.playerId;
    const forward = benchFor(game, 0).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const result = unwrap(swapNow(game, team, roster, center, forward));
    expect(result.warnings.filter((w) => w.kind === 'uncovered')).toEqual([]);
  });

  it('rejects players who are not on the court or not available', () => {
    const game = liveGame();
    const bench = benchFor(game, 0);
    expect(swapNow(game, team, roster, bench[0]!, bench[1]!).ok).toBe(false);
    const starter = game.plan[0]![0]!.playerId;
    expect(swapNow(game, team, roster, starter, 'p11').ok).toBe(false);
    expect(swapNow({ ...game, status: 'planned' }, team, roster, starter, bench[0]!).ok).toBe(false);
  });

  it('lets a player subbed out come back in the same segment', () => {
    const game = liveGame();
    const out = game.plan[0]!.find((s) => s.positionId === 'F')!.playerId;
    const into = benchFor(game, 0).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const once = unwrap(swapNow(game, team, roster, out, into)).game;
    const back = unwrap(swapNow(once, team, roster, into, out)).game;
    expect(onCourt(back)).toContain(out);
    expect(back.subbedOut.map((s) => s.playerId)).toEqual([into]);
  });

  it('keeps mid-segment credit through Undo', () => {
    const game = liveGame();
    const out = game.plan[0]!.find((s) => s.positionId === 'F')!.playerId;
    const into = benchFor(game, 0).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const swapped = unwrap(swapNow(game, team, roster, out, into)).game;
    const undone = undoSegment(nextSegment(swapped));
    expect(undone.current).toBe(0);
    expect(undone.subbedOut.map((s) => s.playerId)).toEqual([out]);
  });
});

describe('swapNext', () => {
  it('changes who comes in at the next substitution', () => {
    const game = liveGame();
    const next = game.plan[1]!;
    const out = next.find((s) => s.positionId === 'F')!.playerId;
    const into = benchFor(game, 1).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    const swapped = unwrap(swapNext(game, team, roster, out, into)).game;
    expect(onCourt(swapped, 1)).toContain(into);
    expect(onCourt(swapped, 0)).toEqual(onCourt(game, 0));
    expect(swapped.events.at(-1)).toMatchObject({ kind: 'swap-next', segment: 1 });
  });

  it('warns, in plain language, when a swap breaks a scheduling rule', () => {
    const game = liveGame();
    // Keep someone from the current lineup on for the next one: they play an
    // extra segment and the player they replace one fewer.
    const stayer = game.plan[0]!.find((s) => s.positionId === 'F')!.playerId;
    const out = game.plan[1]!.find((s) => s.positionId === 'F')!.playerId;
    const result = unwrap(swapNext(game, team, roster, out, stayer));
    const rule = result.warnings.find((w) => w.kind === 'rule');
    expect(rule).toMatchObject({ kind: 'rule', warning: { kind: 'equal-time' } });
    const names = new Map(roster.map((p) => [p.id, p.name]));
    expect(describeSwapWarning(rule!, result.game, team.positions, names)).toMatch(/Playing time isn't equal/);
  });

  it('keeps the swap as locks, so a later re-plan keeps it (D6)', () => {
    let game = liveGame();
    const out = game.plan[1]!.find((s) => s.positionId === 'F')!.playerId;
    const into = benchFor(game, 1).find((id) => roster.find((p) => p.id === id)!.skills.F)!;
    game = unwrap(swapNext(game, team, roster, out, into)).game;
    expect(game.locks).toEqual([
      { segment: 1, playerId: into, kind: 'in' },
      { segment: 1, playerId: out, kind: 'out' },
    ]);

    // An injury to someone else, then a re-plan: the coach's pick stays.
    const injured = benchFor(game, 1).find((id) => id !== out)!;
    game = setStatus(game, injured, { kind: 'out' });
    const after = unwrap(replan(game, team, roster));
    expect(onCourt(after.game, 1)).toContain(into);
    expect(onCourt(after.game, 1)).not.toContain(out);
    expect(after.dropped).toEqual([]);
  });

  it('replaces earlier locks on the same players when the coach changes their mind', () => {
    let game = liveGame();
    const out = game.plan[1]!.find((s) => s.positionId === 'F')!.playerId;
    const forwards = benchFor(game, 1).filter((id) => roster.find((p) => p.id === id)!.skills.F);
    game = unwrap(swapNext(game, team, roster, out, forwards[0]!)).game;
    game = unwrap(swapNext(game, team, roster, forwards[0]!, out)).game;
    expect(game.locks).toEqual([
      { segment: 1, playerId: out, kind: 'in' },
      { segment: 1, playerId: forwards[0], kind: 'out' },
    ]);
  });

  it('drops locks a re-plan can no longer keep, and says which segment', () => {
    // Next lineup has p5 at Center; the coach sends in p6 (the other center) instead.
    let game = liveGame();
    game = {
      ...game,
      plan: game.plan.map((l, i) =>
        i === 1
          ? [
              { playerId: 'p1', positionId: 'G' },
              { playerId: 'p2', positionId: 'G' },
              { playerId: 'p5', positionId: 'C' },
              { playerId: 'p7', positionId: 'F' },
              { playerId: 'p8', positionId: 'F' },
            ]
          : l,
      ),
    };
    game = unwrap(swapNext(game, team, roster, 'p5', 'p6')).game;
    // Then p6 is hurt: p5 is locked out and nobody else plays Center.
    game = setStatus(game, 'p6', { kind: 'out' });
    const after = unwrap(replan(game, team, roster));
    expect(after.dropped).toEqual([1]);
    expect(onCourt(after.game, 1)).toContain('p5');
    expect(after.game.locks.filter((l) => l.segment === 1)).toEqual([]);
  });

  it('rejects swaps that make no sense', () => {
    const game = liveGame();
    const benchNext = benchFor(game, 1);
    expect(swapNext(game, team, roster, benchNext[0]!, benchNext[1]!).ok).toBe(false);
    expect(swapNext(game, team, roster, game.plan[1]![0]!.playerId, 'p11').ok).toBe(false);
    const last = { ...game, current: game.plan.length - 1 };
    expect(swapNext(last, team, roster, 'p1', 'p2').ok).toBe(false);
  });
});

describe('status and re-planning', () => {
  it('re-plans around an injury, keeping played and current segments', () => {
    let game = nextSegment(nextSegment(liveGame()));
    const injured = game.plan[3]![0]!.playerId;
    game = setStatus(game, injured, { kind: 'out' });
    expect(game.statuses[injured]).toEqual({ kind: 'out', from: 3 });
    expect(planConflicts(game).map((c) => c.playerId)).toContain(injured);

    const preview = unwrap(replan(game, team, roster));
    expect(preview.game.plan.slice(0, 3)).toEqual(game.plan.slice(0, 3));
    expect(preview.game.plan.slice(3).every((l) => !l.some((s) => s.playerId === injured))).toBe(true);
    expect(preview.changed.length).toBeGreaterThan(0);
    expect(planConflicts(preview.game)).toEqual([]);
    expect(preview.game.events.at(-1)).toEqual({ kind: 'replan', segment: 2, changes: preview.changed.length });
  });

  it('keeps the rest of the game fair after an injury', () => {
    let game = nextSegment(nextSegment(liveGame()));
    const injured = game.plan[2]![0]!.playerId;
    game = setStatus(game, injured, { kind: 'out' });
    const { game: after } = unwrap(replan(game, team, roster));
    const players = toEnginePlayers(roster.slice(0, 10));
    const analysis = analyzePlan(after.plan, { players, rules: { ...after.rules, positionCoverage: false }, unavailable: unavailableSegments(after, 8) });
    expect(analysis.warnings.filter((w) => w.kind === 'equal-time')).toEqual([]);
    expect(benchLimit(9)).toBe(1);
  });

  it('rests a player for a number of segments, then clears the status', () => {
    let game = liveGame();
    game = setStatus(game, 'p7', { kind: 'resting', segments: 2 });
    expect(game.statuses.p7).toEqual({ kind: 'resting', from: 1, until: 3 });
    const { game: after } = unwrap(replan(game, team, roster));
    expect([1, 2].every((s) => !after.plan[s]!.some((x) => x.playerId === 'p7'))).toBe(true);
    game = setStatus(after, 'p7', null);
    expect(game.statuses.p7).toBeUndefined();
    expect(game.events.at(-1)).toMatchObject({ kind: 'status', playerId: 'p7', status: null });
  });

  it('adds a late arrival from the next segment', () => {
    let game = liveGame();
    game = markArrived(game, 'p11');
    expect(game.attending).toContain('p11');
    expect(game.statuses.p11).toEqual({ kind: 'arrived', at: 1 });
    expect(markArrived(game, 'p11')).toBe(game);
    const { game: after } = unwrap(replan(game, team, roster));
    expect(after.plan.slice(1).filter((l) => l.some((s) => s.playerId === 'p11')).length).toBeGreaterThanOrEqual(2);
  });

  it('explains when too many players are out', () => {
    let game = liveGame();
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) game = setStatus(game, id, { kind: 'out' });
    const result = replan(game, team, roster);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/Only 4 players are available|play Guard|play Center/) });
  });

  it('only re-plans a game in progress', () => {
    expect(replan({ ...liveGame(), status: 'final' }, team, roster).ok).toBe(false);
  });

  it('counts changed segments between two plans', () => {
    const a = [[{ playerId: 'x', positionId: null }], [{ playerId: 'y', positionId: null }]];
    const b = [[{ playerId: 'x', positionId: null }], [{ playerId: 'z', positionId: null }]];
    expect(changedSegments(a, b, 0)).toEqual([1]);
    expect(changedSegments(a, a, 0)).toEqual([]);
  });
});

describe('addSegments (overtime)', () => {
  it('adds segments at the end without touching the rest of the plan', () => {
    let game = liveGame();
    for (let i = 0; i < 7; i++) game = nextSegment(game);
    const { game: ot } = unwrap(addSegments(game, team, roster));
    expect(ot.plan).toHaveLength(9);
    expect(ot.plan.slice(0, 8)).toEqual(game.plan);
    expect(ot.plan[8]).toHaveLength(5);
    expect(ot.events.at(-1)).toEqual({ kind: 'overtime', segment: 7, added: 1 });
    const next = nextSegment(ot);
    expect(next).toMatchObject({ status: 'live', current: 8 });
  });

  it('only adds segments to a game in progress', () => {
    expect(addSegments({ ...liveGame(), status: 'planned' }, team, roster).ok).toBe(false);
  });

  it('explains when overtime cannot be planned', () => {
    let game = liveGame();
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) game = setStatus(game, id, { kind: 'out' });
    expect(addSegments(game, team, roster).ok).toBe(false);
  });
});

describe('schema v2 upgrade', () => {
  it('fills in the new game fields without touching existing ones', () => {
    const old: Partial<Game> = { id: 'g', played: [] };
    upgradeGameV2(old);
    expect(old).toEqual({ id: 'g', played: [], subbedOut: [], statuses: {}, events: [] });
    const current: Partial<Game> = { subbedOut: [{ playerId: 'a', positionId: null }], statuses: {}, events: [] };
    upgradeGameV2(current);
    expect(current.subbedOut).toHaveLength(1);
  });
});
