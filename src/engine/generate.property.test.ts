/**
 * Property-based tests (REQUIREMENTS.md Q-2): fast-check generates random
 * rosters, requirements, absences and fixed segments, and checks the rules
 * that must hold for every one of them.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { benchLimit } from './analyze';
import { generatePlan } from './generate';
import { canCoverWith, requiredSlots } from './positions';
import { lineupCovers, longestBench, playedCounts } from './testUtils';
import type { EnginePlayer, Lineup, Lock, RuleSettings, SkillLevel } from './types';

const POSITIONS = ['G', 'F', 'C'] as const;

const skillArb = fc.constantFrom<SkillLevel>(1, 2, 3);
const playerSkillsArb = fc
  .record({ G: fc.option(skillArb, { nil: undefined }), F: fc.option(skillArb, { nil: undefined }), C: fc.option(skillArb, { nil: undefined }) })
  .map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Partial<Record<string, SkillLevel>>);

const rosterArb = fc
  .array(playerSkillsArb, { minLength: 6, maxLength: 15 })
  .map((skills): EnginePlayer[] => skills.map((s, i) => ({ id: `p${i + 1}`, skills: s })));

const requirementArb = fc.record({ G: fc.integer({ min: 0, max: 2 }), F: fc.integer({ min: 0, max: 2 }), C: fc.integer({ min: 0, max: 1 }) });

const rulesArb: fc.Arbitrary<RuleSettings> = fc.record({
  positionCoverage: fc.boolean(),
  equalTime: fc.boolean(),
  limitBench: fc.boolean(),
  balanceSkill: fc.boolean(),
});

const RUNS = 150;

describe('generatePlan — properties', { timeout: 60_000 }, () => {
  it('always returns valid lineups, and covers positions whenever it returns a plan (H1)', () => {
    fc.assert(
      fc.property(rosterArb, requirementArb, rulesArb, fc.integer({ min: 1, max: 12 }), fc.integer(), (players, requirement, rules, segmentCount, seed) => {
        const result = generatePlan({ players, requirement, rules, segmentCount, seed });
        if (!result.ok) {
          // Only a position problem can stop a full-attendance roster of 6+.
          expect(rules.positionCoverage).toBe(true);
          expect(['positions-uncoverable', 'requirement-too-large']).toContain(result.error.kind);
          return;
        }
        expect(result.plan).toHaveLength(segmentCount);
        const ids = new Set(players.map((p) => p.id));
        for (const lineup of result.plan) {
          expect(lineup).toHaveLength(5);
          expect(new Set(lineup.map((s) => s.playerId)).size).toBe(5);
          expect(lineup.every((s) => ids.has(s.playerId))).toBe(true);
          if (rules.positionCoverage) expect(lineupCovers(lineup, players, requirement)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('keeps time within 1 and bench stretches within the limit when positions are off (R1, R2)', () => {
    fc.assert(
      fc.property(rosterArb, fc.integer({ min: 1, max: 16 }), fc.option(fc.integer(), { nil: undefined }), (players, segmentCount, seed) => {
        const rules = { positionCoverage: false, equalTime: true, limitBench: true, balanceSkill: false };
        const result = generatePlan({ players, requirement: {}, rules, segmentCount, seed });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const counts = Object.values(playedCounts(result.plan, players));
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        expect(Math.max(...Object.values(longestBench(result.plan, players)))).toBeLessThanOrEqual(benchLimit(players.length));
        expect(result.warnings).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it('never changes fixed (already played) segments', () => {
    fc.assert(
      fc.property(rosterArb, fc.integer({ min: 2, max: 12 }), fc.integer(), fc.integer(), (players, segmentCount, seedA, seedB) => {
        const rules = { positionCoverage: false, equalTime: true, limitBench: true, balanceSkill: false };
        const first = generatePlan({ players, requirement: {}, rules, segmentCount, seed: seedA });
        if (!first.ok) return;
        const cut = Math.floor(segmentCount / 2);
        const fixed: Lineup[] = first.plan.slice(0, cut);
        const second = generatePlan({ players, requirement: {}, rules, segmentCount, seed: seedB, fixed, previous: first.plan });
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.plan.slice(0, cut)).toEqual(fixed);
      }),
      { numRuns: RUNS },
    );
  });

  it('never puts an unavailable player on the court', () => {
    fc.assert(
      fc.property(
        rosterArb,
        fc.integer({ min: 1, max: 10 }),
        fc.array(fc.tuple(fc.nat(14), fc.nat(9)), { maxLength: 6 }),
        (players, segmentCount, absences) => {
          const unavailable: Record<string, number[]> = {};
          for (const [p, s] of absences) {
            const id = players[p % players.length]!.id;
            (unavailable[id] ??= []).push(s);
          }
          const rules = { positionCoverage: false, equalTime: true, limitBench: true, balanceSkill: false };
          const result = generatePlan({ players, requirement: {}, rules, segmentCount, unavailable });
          if (!result.ok) {
            expect(result.error.kind).toBe('not-enough-players');
            return;
          }
          result.plan.forEach((lineup, segment) => {
            for (const slot of lineup) expect(unavailable[slot.playerId]?.includes(segment) ?? false).toBe(false);
          });
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('always respects locks, or reports a segment whose locks really cannot work (G6, G7)', () => {
    const lockArb = fc.record({ player: fc.nat(14), segment: fc.nat(9), kind: fc.constantFrom<Lock['kind']>('in', 'out') });
    fc.assert(
      fc.property(
        rosterArb,
        requirementArb,
        rulesArb,
        fc.integer({ min: 1, max: 10 }),
        fc.array(lockArb, { maxLength: 8 }),
        fc.integer(),
        (players, requirement, rules, segmentCount, rawLocks, seed) => {
          const locks: Lock[] = rawLocks.map((l) => ({
            segment: l.segment,
            playerId: players[l.player % players.length]!.id,
            kind: l.kind,
          }));
          const result = generatePlan({ players, requirement, rules, segmentCount, locks, seed });
          const locksAt = (segment: number) => {
            const here = locks.filter((l) => l.segment === segment);
            const out = new Set(here.filter((l) => l.kind === 'out').map((l) => l.playerId));
            const inIds = new Set(here.filter((l) => l.kind === 'in' && !out.has(l.playerId)).map((l) => l.playerId));
            return { out, inIds };
          };
          if (!result.ok) {
            if (result.error.kind === 'positions-uncoverable' || result.error.kind === 'requirement-too-large') return;
            expect(['too-many-locked-out', 'too-many-locked-in', 'locks-uncoverable']).toContain(result.error.kind);
            const { out, inIds } = locksAt(result.error.segment);
            const forced = players.filter((p) => inIds.has(p.id));
            const others = players.filter((p) => !out.has(p.id) && !inIds.has(p.id));
            const slots = rules.positionCoverage ? requiredSlots(requirement) : [];
            expect(forced.length + others.length >= 5 && canCoverWith(forced, others, slots)).toBe(false);
            return;
          }
          result.plan.forEach((lineup, segment) => {
            const ids = new Set(lineup.map((s) => s.playerId));
            expect(ids.size).toBe(5);
            const { out, inIds } = locksAt(segment);
            for (const id of out) expect(ids.has(id)).toBe(false);
            for (const id of inIds) expect(ids.has(id)).toBe(true);
            if (rules.positionCoverage) expect(lineupCovers(lineup, players, requirement)).toBe(true);
          });
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('only shows positions a player can actually play', () => {
    fc.assert(
      fc.property(rosterArb, rulesArb, (players, rules) => {
        const result = generatePlan({ players, requirement: { G: 1 }, rules, segmentCount: 4 });
        if (!result.ok) return;
        const byId = new Map(players.map((p) => [p.id, p]));
        for (const lineup of result.plan) {
          for (const slot of lineup) {
            if (slot.positionId === null) expect(Object.keys(byId.get(slot.playerId)!.skills)).toHaveLength(0);
            else expect(POSITIONS).toContain(slot.positionId);
            if (slot.positionId !== null) expect(byId.get(slot.playerId)!.skills[slot.positionId]).toBeDefined();
          }
        }
      }),
      { numRuns: RUNS },
    );
  });
});
