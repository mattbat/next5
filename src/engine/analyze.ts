import { COURT_SIZE, type EnginePlayer, type Lineup, type PlayerId, type RuleSettings, type Warning } from './types';

const EPSILON = 1e-9;

/**
 * Longest allowed bench stretch for this many available players (R2):
 * ceil((players - 5) / 5). 6–10 players → 1, 11–15 → 2.
 */
export function benchLimit(availableCount: number): number {
  return Math.max(1, Math.ceil((availableCount - COURT_SIZE) / COURT_SIZE));
}

export function isAvailable(
  unavailable: Partial<Record<PlayerId, number[]>> | undefined,
  playerId: PlayerId,
  segment: number,
): boolean {
  return !(unavailable?.[playerId]?.includes(segment) ?? false);
}

export interface PlanAnalysis {
  /** Segments on court per player. */
  played: Record<PlayerId, number>;
  /** Segments each player was available for. */
  available: Record<PlayerId, number>;
  warnings: Warning[];
  /** Lower is better. Weighted by rule priority: R1 > R2 > fewest changes > R3. */
  score: number;
}

interface AnalyzeOptions {
  players: EnginePlayer[];
  rules: RuleSettings;
  unavailable?: Partial<Record<PlayerId, number[]>>;
  previous?: Lineup[];
}

const WEIGHT_EQUAL = 1_000_000;
const WEIGHT_BENCH = 1_000;
const WEIGHT_CHANGE = 20;
const WEIGHT_SKILL = 10;

/** Max skill a player has at any position (used when a slot has no position). */
function topSkill(player: EnginePlayer | undefined): number {
  if (!player) return 2;
  const levels = Object.values(player.skills).filter((v): v is 1 | 2 | 3 => v !== undefined);
  return levels.length === 0 ? 2 : Math.max(...levels);
}

/** Skill of a player at the position they're shown at in this slot. */
export function slotSkill(player: EnginePlayer | undefined, positionId: string | null): number {
  if (!player) return 2;
  if (positionId !== null && player.skills[positionId] !== undefined) return player.skills[positionId]!;
  return topSkill(player);
}

/** R3 penalty for one lineup: more than 1 Rising player, or more than 2 Go-To players. */
export function skillStackPenalty(lineup: Lineup, byId: Map<PlayerId, EnginePlayer>): number {
  let rising = 0;
  let goTo = 0;
  for (const slot of lineup) {
    const skill = slotSkill(byId.get(slot.playerId), slot.positionId);
    if (skill === 1) rising++;
    if (skill === 3) goTo++;
  }
  return Math.max(0, rising - 1) + Math.max(0, goTo - 2);
}

/**
 * Checks a whole plan against the rules. Used to score candidate plans and to
 * show the coach which rules were relaxed (REQUIREMENTS.md §5, G5).
 */
export function analyzePlan(plan: Lineup[], options: AnalyzeOptions): PlanAnalysis {
  const { players, rules, unavailable, previous } = options;
  const byId = new Map(players.map((p) => [p.id, p]));
  const played: Record<PlayerId, number> = {};
  const available: Record<PlayerId, number> = {};
  const expected: Record<PlayerId, number> = {};
  const streak: Record<PlayerId, number> = {};
  const streakStart: Record<PlayerId, number> = {};
  const worstStreak = new Map<PlayerId, { start: number; length: number; limit: number }>();
  for (const p of players) {
    played[p.id] = 0;
    available[p.id] = 0;
    expected[p.id] = 0;
    streak[p.id] = 0;
  }

  let benchExcess = 0;
  let skillPenalty = 0;
  let changes = 0;
  const warnings: Warning[] = [];

  plan.forEach((lineup, segment) => {
    const onCourt = new Set(lineup.map((s) => s.playerId));
    const avail = players.filter((p) => isAvailable(unavailable, p.id, segment));
    const limit = benchLimit(avail.length);
    for (const p of players) {
      if (!avail.includes(p)) {
        streak[p.id] = 0;
        continue;
      }
      available[p.id]! += 1;
      expected[p.id]! += COURT_SIZE / avail.length;
      if (onCourt.has(p.id)) {
        played[p.id]! += 1;
        streak[p.id] = 0;
        continue;
      }
      if (streak[p.id] === 0) streakStart[p.id] = segment;
      streak[p.id]! += 1;
      if (streak[p.id]! > limit) {
        benchExcess += 1;
        const worst = worstStreak.get(p.id);
        if (!worst || streak[p.id]! > worst.length) {
          worstStreak.set(p.id, { start: streakStart[p.id]!, length: streak[p.id]!, limit });
        }
      }
    }
    if (rules.balanceSkill) {
      const penalty = skillStackPenalty(lineup, byId);
      if (penalty > 0) {
        skillPenalty += penalty;
        warnings.push({ kind: 'skill-stack', segment });
      }
    }
    const before = previous?.[segment];
    if (before) {
      const kept = new Set(before.map((s) => s.playerId));
      changes += lineup.filter((s) => !kept.has(s.playerId)).length;
    }
  });

  // Equal time: compare each player's segments to their fair share of the
  // segments they were available for. With no absences this is max - min.
  const eligible = players.filter((p) => available[p.id]! > 0);
  let spread = 0;
  if (eligible.length > 0) {
    const deviation = eligible.map((p) => ({ id: p.id, d: played[p.id]! - expected[p.id]! }));
    const max = Math.max(...deviation.map((x) => x.d));
    const min = Math.min(...deviation.map((x) => x.d));
    spread = max - min;
    // With no absences the spread is a whole number, so this means "differs by 2+".
    // With absences, fair shares are fractional and we allow a little slack.
    if (rules.equalTime && spread > 1.5) {
      warnings.unshift({
        kind: 'equal-time',
        most: deviation.filter((x) => x.d > max - EPSILON).map((x) => x.id),
        fewest: deviation.filter((x) => x.d < min + EPSILON).map((x) => x.id),
        spread: Math.round(spread),
      });
    }
  }

  if (rules.limitBench) {
    for (const [playerId, worst] of worstStreak) {
      warnings.push({
        kind: 'bench-streak',
        playerId,
        startSegment: worst.start,
        length: worst.length,
        limit: worst.limit,
      });
    }
  }

  const score =
    (rules.equalTime ? WEIGHT_EQUAL * Math.max(0, spread - 1) : 0) +
    (rules.limitBench ? WEIGHT_BENCH * benchExcess : 0) +
    WEIGHT_CHANGE * changes +
    (rules.balanceSkill ? WEIGHT_SKILL * skillPenalty : 0);

  return { played, available, warnings, score };
}
