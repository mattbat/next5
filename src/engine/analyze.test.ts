import { describe, expect, it } from 'vitest';
import { analyzePlan, benchLimit, skillStackPenalty, slotSkill } from './analyze';
import { ALL_RULES, makePlayers } from './testUtils';
import type { Lineup } from './types';

const lineup = (...ids: number[]): Lineup => ids.map((i) => ({ playerId: `p${i}`, positionId: null }));

describe('benchLimit', () => {
  it.each([
    [5, 1],
    [6, 1],
    [8, 1],
    [10, 1],
    [11, 2],
    [12, 2],
    [15, 2],
    [16, 3],
  ])('%i players → at most %i segment(s) in a row on the bench', (players, limit) => {
    expect(benchLimit(players)).toBe(limit);
  });
});

describe('analyzePlan', () => {
  const players = makePlayers(6);
  const rules = { ...ALL_RULES, positionCoverage: false };

  it('counts segments played and available', () => {
    const result = analyzePlan([lineup(1, 2, 3, 4, 5), lineup(2, 3, 4, 5, 6)], { players, rules });
    expect(result.played).toMatchObject({ p1: 1, p2: 2, p6: 1 });
    expect(result.available.p1).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('warns when playing time differs by 2 or more', () => {
    const plan = [lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 6)];
    const result = analyzePlan(plan, { players, rules: { ...rules, limitBench: false } });
    expect(result.warnings).toEqual([
      { kind: 'equal-time', most: ['p1', 'p2', 'p3', 'p4'], fewest: ['p6'], spread: 2 },
    ]);
    expect(result.score).toBeGreaterThan(0);
  });

  it('warns about bench stretches longer than the limit', () => {
    const plan = [lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 5)];
    const result = analyzePlan(plan, { players, rules: { ...rules, equalTime: false } });
    expect(result.warnings).toEqual([
      { kind: 'bench-streak', playerId: 'p6', startSegment: 0, length: 2, limit: 1 },
    ]);
  });

  it('ignores rules that are turned off', () => {
    const plan = [lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 5)];
    const result = analyzePlan(plan, {
      players,
      rules: { positionCoverage: false, equalTime: false, limitBench: false, balanceSkill: false },
    });
    expect(result.warnings).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('measures fairness against the segments a player was available for', () => {
    // p6 arrives for the last segment only and plays it: that's fair.
    const plan = [lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 6)];
    const result = analyzePlan(plan, { players, rules, unavailable: { p6: [0] } });
    expect(result.available.p6).toBe(1);
    expect(result.warnings.filter((w) => w.kind === 'equal-time')).toEqual([]);
  });

  it('does not count unavailable segments as bench time', () => {
    const plan = [lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 5), lineup(1, 2, 3, 4, 6)];
    const result = analyzePlan(plan, { players, rules, unavailable: { p6: [0, 1] } });
    expect(result.warnings.filter((w) => w.kind === 'bench-streak')).toEqual([]);
  });

  it('counts changes from a previous plan', () => {
    const previous = [lineup(1, 2, 3, 4, 5)];
    const same = analyzePlan([lineup(1, 2, 3, 4, 5)], { players, rules, previous });
    const changed = analyzePlan([lineup(1, 2, 3, 4, 6)], { players, rules, previous });
    expect(changed.score).toBeGreaterThan(same.score);
  });

  it('flags lineups that stack skill levels when balance skill is on', () => {
    const skilled = makePlayers(6, (i) => (i < 3 ? { G: 1 } : { G: 3 }));
    const plan = [lineup(1, 2, 4, 5, 6)];
    const result = analyzePlan(plan, { players: skilled, rules: { ...rules, balanceSkill: true } });
    expect(result.warnings).toContainEqual({ kind: 'skill-stack', segment: 0 });
  });
});

describe('skill helpers', () => {
  const players = makePlayers(5, (i) => (i < 2 ? { G: 1 } : i < 5 ? { G: 3, F: 1 } : {}));
  const byId = new Map(players.map((p) => [p.id, p]));

  it('uses the skill at the shown position, or the best skill when none is shown', () => {
    expect(slotSkill(players[2], 'F')).toBe(1);
    expect(slotSkill(players[2], null)).toBe(3);
    expect(slotSkill(undefined, null)).toBe(2);
    expect(slotSkill({ id: 'x', skills: {} }, null)).toBe(2);
  });

  it('penalizes more than 1 Rising or more than 2 Go-To players', () => {
    const shown: Lineup = players.map((p) => ({ playerId: p.id, positionId: 'G' }));
    // 2 Rising (1 too many) + 3 Go-To (1 too many).
    expect(skillStackPenalty(shown, byId)).toBe(2);
  });
});
