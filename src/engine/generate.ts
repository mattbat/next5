import { analyzePlan, benchLimit, isAvailable, skillStackPenalty } from './analyze';
import { assignPositions, canCover, canCoverWith, missingPositions, missingWithLocks, requiredSlots } from './positions';
import { createRandom } from './random';
import {
  COURT_SIZE,
  type EnginePlayer,
  type GenerateInput,
  type GenerateResult,
  type Lineup,
  type Lock,
  type PlayerId,
} from './types';

/**
 * How the generator works (also explained in the developer README):
 *
 * 1. Validate: enough players and position coverage possible in every segment.
 * 2. Build a plan one segment at a time. For each segment, pick the cheapest
 *    5 players (trying combinations of the most "due" players when positions
 *    or skill balance make the choice depend on the whole lineup):
 *      - players who are behind on playing time are cheaper to pick (R1),
 *      - benching someone past the bench limit is expensive (R2),
 *      - keeping a player from the previous plan is cheaper (fewest changes),
 *      - stacking Rising / Go-To players is a little more expensive (R3),
 *      - combinations that can't cover the required positions are skipped (H1),
 *      - locked-in players are always picked and locked-out players never (G6).
 * 3. Repeat with a little random jitter, score each whole plan with
 *    `analyzePlan`, and keep the best one.
 */

const RUNS = 40;
const POOL_SIZE = 8;
const COST_PLAYED = 100;
const COST_BENCH = 150;
// Larger than JITTER so a reshuffle never moves a player without a reason.
const COST_KEEP = 80;
const COST_SKILL = 40;
const JITTER = 60;

function* combinations<T>(items: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i <= items.length - (k - picked.length); i++) {
    picked.push(items[i]!);
    yield* combinations(items, k, i + 1, picked);
    picked.pop();
  }
}

interface SegmentLocks {
  in: Set<PlayerId>;
  out: Set<PlayerId>;
}

/** Locks grouped by segment. A lock-out wins over a lock-in for the same player. */
function locksBySegment(locks: Lock[] | undefined): Map<number, SegmentLocks> {
  const bySegment = new Map<number, SegmentLocks>();
  for (const lock of locks ?? []) {
    let entry = bySegment.get(lock.segment);
    if (!entry) bySegment.set(lock.segment, (entry = { in: new Set(), out: new Set() }));
    entry[lock.kind].add(lock.playerId);
  }
  for (const entry of bySegment.values()) for (const id of entry.out) entry.in.delete(id);
  return bySegment;
}

/**
 * Splits a segment's available players into those locked in and the rest
 * who may be picked. Locked-out players are in neither list.
 */
function splitByLocks(avail: EnginePlayer[], locks: SegmentLocks | undefined) {
  const pickable = avail.filter((p) => !locks?.out.has(p.id));
  const forced = pickable.filter((p) => locks?.in.has(p.id));
  const others = pickable.filter((p) => !locks?.in.has(p.id));
  return { pickable, forced, others };
}

interface State {
  played: Record<PlayerId, number>;
  expected: Record<PlayerId, number>;
  streak: Record<PlayerId, number>;
}

function advanceState(state: State, lineup: Lineup, avail: EnginePlayer[], all: EnginePlayer[]): void {
  const onCourt = new Set(lineup.map((s) => s.playerId));
  for (const p of all) {
    if (!avail.includes(p)) {
      state.streak[p.id] = 0;
      continue;
    }
    state.expected[p.id]! += COURT_SIZE / avail.length;
    if (onCourt.has(p.id)) {
      state.played[p.id]! += 1;
      state.streak[p.id] = 0;
    } else {
      state.streak[p.id]! += 1;
    }
  }
}

function buildPlan(input: GenerateInput, slots: string[], random: () => number, jitter: number): Lineup[] {
  const { players, rules, unavailable, previous } = input;
  const fixed = input.fixed ?? [];
  const locks = locksBySegment(input.locks);
  const byId = new Map(players.map((p) => [p.id, p]));
  const state: State = { played: {}, expected: {}, streak: {} };
  for (const p of players) {
    state.played[p.id] = 0;
    state.expected[p.id] = 0;
    state.streak[p.id] = 0;
  }

  const plan: Lineup[] = [];
  for (let segment = 0; segment < input.segmentCount; segment++) {
    const avail = players.filter((p) => isAvailable(unavailable, p.id, segment));
    if (segment < fixed.length) {
      plan.push(fixed[segment]!);
      advanceState(state, fixed[segment]!, avail, players);
      continue;
    }

    const limit = benchLimit(avail.length);
    const behind = (p: EnginePlayer) => state.played[p.id]! - state.expected[p.id]!;
    const noise = new Map(avail.map((p) => [p.id, jitter * random()]));
    const kept = new Set(previous?.[segment]?.map((s) => s.playerId) ?? []);

    // What it costs to put this player on the court, ignoring the other four:
    // players behind on playing time, longer on the bench, or already in the
    // previous plan's lineup are cheaper.
    const playerCost = (p: EnginePlayer) =>
      (rules.equalTime ? COST_PLAYED * behind(p) : 0) -
      state.streak[p.id]! +
      noise.get(p.id)! -
      (kept.has(p.id) ? COST_KEEP : 0);
    // Benching a player past the limit costs the same as "rewarding" playing
    // them, so the bench rule folds into each player's own cost.
    const benchCost = (p: EnginePlayer) => {
      const after = state.streak[p.id]! + 1;
      return rules.limitBench && after > limit ? COST_BENCH * (after - limit) : 0;
    };
    const cost = new Map(avail.map((p) => [p.id, playerCost(p) - benchCost(p)]));
    const { forced, others } = splitByLocks(avail, locks.get(segment));
    const free = COURT_SIZE - forced.length;
    const ranked = [...others].sort((a, b) => cost.get(a.id)! - cost.get(b.id)!);

    let best: EnginePlayer[] | null = null;
    if (slots.length === 0 && !rules.balanceSkill) {
      // Costs are independent per player: the cheapest five are the best lineup.
      best = [...forced, ...ranked.slice(0, free)];
    } else {
      // Positions or skill balance depend on the whole lineup, so search
      // combinations of the most due players, widening the pool if needed.
      let bestCost = Infinity;
      for (let size = POOL_SIZE; best === null; size += 2) {
        const pool = ranked.slice(0, size);
        for (const fill of combinations(pool, free)) {
          const combo = [...forced, ...fill];
          if (slots.length > 0 && !canCover(combo, slots)) continue;
          let total = 0;
          for (const p of combo) total += cost.get(p.id)!;
          // R3 counts each player's skill at the position they'd be shown at,
          // the same way analyzePlan scores and warns. The penalty only adds,
          // so skip it for a combination that's already too expensive.
          if (rules.balanceSkill && total < bestCost) {
            total += COST_SKILL * skillStackPenalty(assignPositions(combo, slots)!, byId);
          }
          if (total < bestCost) {
            bestCost = total;
            best = combo;
          }
        }
        if (size >= ranked.length) break;
      }
    }

    // Validation in generatePlan guarantees a covering combination exists.
    const lineup = assignPositions(best!, slots)!;
    plan.push(lineup);
    advanceState(state, lineup, avail, players);
  }
  return plan;
}

/** Generates a rotation that follows the enabled rules (REQUIREMENTS.md §5, G4, G7, G8, D6). */
export function generatePlan(input: GenerateInput): GenerateResult {
  const { players, rules, unavailable } = input;
  const slots = rules.positionCoverage ? requiredSlots(input.requirement) : [];
  if (slots.length > COURT_SIZE) {
    return { ok: false, error: { kind: 'requirement-too-large', total: slots.length } };
  }

  const fixedCount = Math.min(input.fixed?.length ?? 0, input.segmentCount);
  const locks = locksBySegment(input.locks);
  for (let segment = fixedCount; segment < input.segmentCount; segment++) {
    const avail = players.filter((p) => isAvailable(unavailable, p.id, segment));
    if (avail.length < COURT_SIZE) {
      return { ok: false, error: { kind: 'not-enough-players', segment, available: avail.length } };
    }
    if (!canCover(avail, slots)) {
      return {
        ok: false,
        error: { kind: 'positions-uncoverable', segment, missing: missingPositions(avail, input.requirement) },
      };
    }
    const { pickable, forced, others } = splitByLocks(avail, locks.get(segment));
    if (pickable.length < COURT_SIZE) {
      return { ok: false, error: { kind: 'too-many-locked-out', segment, available: pickable.length } };
    }
    if (forced.length > COURT_SIZE) {
      return { ok: false, error: { kind: 'too-many-locked-in', segment, count: forced.length } };
    }
    if (!canCoverWith(forced, others, slots)) {
      return {
        ok: false,
        error: { kind: 'locks-uncoverable', segment, missing: missingWithLocks(forced, others, input.requirement) },
      };
    }
  }

  const random = createRandom(input.seed ?? 1);
  let bestPlan: Lineup[] = [];
  let bestScore = Infinity;
  for (let run = 0; run < RUNS; run++) {
    // Without a seed the first run has no jitter, giving the "textbook"
    // rotation. With a seed (Regenerate / shuffle) every run is jittered so
    // different seeds give different plans of equal quality.
    const plan = buildPlan(input, slots, random, run === 0 && input.seed === undefined ? 0 : JITTER);
    const { score } = analyzePlan(plan, input);
    if (score < bestScore) {
      bestScore = score;
      bestPlan = plan;
    }
  }

  const { warnings } = analyzePlan(bestPlan, input);
  return { ok: true, plan: bestPlan, warnings };
}
