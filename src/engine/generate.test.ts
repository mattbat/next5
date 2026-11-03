import { describe, expect, it } from 'vitest';
import { generatePlan } from './generate';
import {
  ALL_RULES,
  NO_RULES,
  baseInput,
  lineupCovers,
  longestBench,
  makePlayers,
  playedCounts,
  typicalRoster,
} from './testUtils';
import { benchLimit } from './analyze';
import type { GenerateInput, Lineup } from './types';

function plan(input: GenerateInput): Lineup[] {
  const result = generatePlan(input);
  if (!result.ok) throw new Error(`expected a plan, got ${JSON.stringify(result.error)}`);
  return result.plan;
}

describe('generatePlan — basics', () => {
  it('produces one 5-player lineup of distinct players per segment', () => {
    const result = plan(baseInput());
    expect(result).toHaveLength(8);
    for (const lineup of result) {
      expect(lineup).toHaveLength(5);
      expect(new Set(lineup.map((s) => s.playerId)).size).toBe(5);
    }
  });

  it('returns an empty plan for zero segments', () => {
    expect(plan(baseInput({ segmentCount: 0 }))).toEqual([]);
  });

  it('is repeatable for the same input', () => {
    expect(plan(baseInput())).toEqual(plan(baseInput()));
    expect(plan(baseInput({ seed: 7 }))).toEqual(plan(baseInput({ seed: 7 })));
  });

  it('gives different plans for different seeds (shuffle)', () => {
    const plans = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(plan(baseInput({ seed })))));
    expect(plans.size).toBeGreaterThan(1);
  });

  it('plays everyone every segment with exactly 5 players', () => {
    const players = makePlayers(5);
    const counts = playedCounts(plan(baseInput({ players })), players);
    expect(Object.values(counts)).toEqual([8, 8, 8, 8, 8]);
  });
});

describe('generatePlan — R1 equal playing time and R2 bench limit', () => {
  it.each([6, 7, 8, 9, 10, 11, 12, 13, 14, 15])('%i players, 8 segments: within 1 and no long bench stretch', (n) => {
    const players = makePlayers(n);
    const result = generatePlan(baseInput({ players }));
    expect(result.ok && result.warnings).toEqual([]);
    const counts = Object.values(playedCounts(plan(baseInput({ players })), players));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    const benches = Object.values(longestBench(plan(baseInput({ players })), players));
    expect(Math.max(...benches)).toBeLessThanOrEqual(benchLimit(n));
  });

  it('never sits anyone twice in a row with 8 players (the common case)', () => {
    const players = makePlayers(8);
    const benches = longestBench(plan(baseInput({ players, segmentCount: 8 })), players);
    expect(Math.max(...Object.values(benches))).toBe(1);
  });

  it('works for halves × 4 segments', () => {
    const players = makePlayers(9);
    const counts = Object.values(playedCounts(plan(baseInput({ players, segmentCount: 8 })), players));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe('generatePlan — H1 position coverage', () => {
  const requirement = { G: 2, C: 1 };

  it('covers the required positions in every lineup', () => {
    const players = typicalRoster(10);
    const result = plan(baseInput({ players, requirement, rules: ALL_RULES }));
    for (const lineup of result) expect(lineupCovers(lineup, players, requirement)).toBe(true);
  });

  it('still keeps playing time equal with a typical roster', () => {
    const players = typicalRoster(10);
    const counts = Object.values(playedCounts(plan(baseInput({ players, requirement, rules: ALL_RULES })), players));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('plays a scarce specialist more when needed, and says so', () => {
    // Only one player can play Center, so they must play every segment.
    const players = makePlayers(10, (i) => (i === 0 ? { C: 2 } : { G: 2, F: 2 }));
    const result = generatePlan(baseInput({ players, requirement: { C: 1 }, rules: ALL_RULES }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.every((l) => l.some((s) => s.playerId === 'p1' && s.positionId === 'C'))).toBe(true);
    expect(result.warnings[0]).toMatchObject({ kind: 'equal-time', most: ['p1'] });
  });

  it('stops with the missing position when nobody can cover it', () => {
    const players = makePlayers(8, () => ({ G: 2, F: 2 }));
    const result = generatePlan(baseInput({ players, requirement, rules: ALL_RULES }));
    expect(result).toEqual({ ok: false, error: { kind: 'positions-uncoverable', segment: 0, missing: ['C'] } });
  });

  it('rejects a requirement of more than 5 players', () => {
    const result = generatePlan(baseInput({ requirement: { G: 3, C: 3 }, rules: ALL_RULES }));
    expect(result).toEqual({ ok: false, error: { kind: 'requirement-too-large', total: 6 } });
  });

  it('ignores the requirement when position coverage is off', () => {
    const players = makePlayers(8, () => ({ G: 2 }));
    expect(generatePlan(baseInput({ players, requirement: { C: 1 } })).ok).toBe(true);
  });

  it('expands the search when the most-due players cannot cover positions', () => {
    // The only Centers have played the most, so they're ranked last.
    const players = makePlayers(14, (i) => (i >= 12 ? { C: 2 } : { G: 2 }));
    const result = plan(baseInput({ players, requirement: { C: 1 }, rules: ALL_RULES, segmentCount: 4 }));
    for (const lineup of result) expect(lineupCovers(lineup, players, { C: 1 })).toBe(true);
  });
});

describe('generatePlan — R3 balance skill', () => {
  it('avoids putting several Rising players on the court together', () => {
    // 2 Rising players × 4 segments each = 8 Rising slots: exactly 1 per lineup is possible.
    const players = makePlayers(10, (i) => (i < 2 ? { G: 1 } : { G: 2 }));
    const rules = { ...NO_RULES, equalTime: true, limitBench: true, balanceSkill: true };
    const result = generatePlan(baseInput({ players, rules }));
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('avoids bunching Go-To players', () => {
    const players = makePlayers(10, (i) => (i < 5 ? { G: 3 } : { G: 2 }));
    const rules = { ...NO_RULES, equalTime: true, balanceSkill: true };
    const result = plan(baseInput({ players, rules }));
    const goToPerLineup = result.map((l) => l.filter((s) => Number(s.playerId.slice(1)) <= 5).length);
    expect(Math.max(...goToPerLineup)).toBeLessThanOrEqual(3);
  });
});

describe('generatePlan — fixed segments, previous plans, and availability', () => {
  it('keeps fixed segments exactly as given and generates the rest', () => {
    const first = plan(baseInput());
    const fixed = first.slice(0, 3);
    const result = plan(baseInput({ fixed, seed: 99 }));
    expect(result.slice(0, 3)).toEqual(fixed);
    expect(result).toHaveLength(8);
  });

  it('balances playing time across the whole game, including fixed segments', () => {
    const players = makePlayers(10);
    // p1–p5 played the first two segments; the rest of the plan should catch up p6–p10.
    const five = (ids: number[]): Lineup => ids.map((i) => ({ playerId: `p${i}`, positionId: null }));
    const fixed = [five([1, 2, 3, 4, 5]), five([1, 2, 3, 4, 5])];
    const counts = Object.values(
      playedCounts(plan(baseInput({ players, fixed, rules: { ...NO_RULES, equalTime: true } })), players),
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('returns the fixed plan when every segment is fixed', () => {
    const first = plan(baseInput());
    expect(plan(baseInput({ fixed: first }))).toEqual(first);
  });

  it('changes as little as possible from a previous plan', () => {
    const previous = plan(baseInput({ seed: 3 }));
    const regenerated = plan(baseInput({ previous, seed: 4 }));
    const players = (p: Lineup[]) => p.map((l) => l.map((s) => s.playerId).sort());
    expect(players(regenerated)).toEqual(players(previous));
  });

  it('makes only the changes needed when a player becomes unavailable', () => {
    const players = makePlayers(10);
    const previous = plan(baseInput({ players }));
    const fixed = previous.slice(0, 4);
    // p1 is injured for the rest of the game.
    const unavailable = { p1: [4, 5, 6, 7] };
    const result = plan(baseInput({ players, fixed, previous, unavailable }));
    expect(result.slice(4).every((l) => l.every((s) => s.playerId !== 'p1'))).toBe(true);
    let changes = 0;
    for (let s = 4; s < 8; s++) {
      const before = new Set(previous[s]!.map((x) => x.playerId));
      changes += result[s]!.filter((x) => !before.has(x.playerId)).length;
    }
    // p1 was in 2 of the last 4 lineups; a few extra moves keep time fair.
    expect(changes).toBeLessThanOrEqual(6);
  });

  it('plays a late arrival once they arrive', () => {
    const players = makePlayers(9);
    const unavailable = { p9: [0, 1, 2, 3] };
    const result = plan(baseInput({ players, unavailable }));
    expect(result.slice(0, 4).every((l) => l.every((s) => s.playerId !== 'p9'))).toBe(true);
    expect(result.slice(4).filter((l) => l.some((s) => s.playerId === 'p9')).length).toBeGreaterThanOrEqual(2);
  });

  it('stops when fewer than 5 players are available', () => {
    const players = makePlayers(5);
    const result = generatePlan(baseInput({ players, unavailable: { p1: [2] } }));
    expect(result).toEqual({ ok: false, error: { kind: 'not-enough-players', segment: 2, available: 4 } });
  });

  it('stops when an absence makes a position uncoverable', () => {
    const players = makePlayers(8, (i) => (i === 0 ? { C: 2 } : { G: 2 }));
    const result = generatePlan(baseInput({ players, requirement: { C: 1 }, rules: ALL_RULES, unavailable: { p1: [5] } }));
    expect(result).toEqual({ ok: false, error: { kind: 'positions-uncoverable', segment: 5, missing: ['C'] } });
  });
});

describe('generatePlan — performance (N2)', () => {
  // Target is under 1 second on a phone; the test allows 3 seconds so slower
  // CI machines don't fail spuriously (the agreed maximum is 3–5 seconds).
  it('plans 15 players × 16 segments with positions quickly', () => {
    const players = typicalRoster(15);
    const start = performance.now();
    const result = generatePlan({
      players,
      segmentCount: 16,
      requirement: { G: 2, C: 1 },
      rules: { ...ALL_RULES, balanceSkill: true },
    });
    expect(result.ok).toBe(true);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
