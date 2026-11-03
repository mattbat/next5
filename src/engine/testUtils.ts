import type { EnginePlayer, GenerateInput, Lineup, PlayerId, RuleSettings, SkillLevel } from './types';

export const ALL_RULES: RuleSettings = {
  positionCoverage: true,
  equalTime: true,
  limitBench: true,
  balanceSkill: false,
};

export const NO_RULES: RuleSettings = {
  positionCoverage: false,
  equalTime: false,
  limitBench: false,
  balanceSkill: false,
};

/** Players p1..pn, each eligible for the positions given (default: everything at Steady). */
export function makePlayers(
  n: number,
  skills: (i: number) => Partial<Record<string, SkillLevel>> = () => ({ G: 2, F: 2, C: 2 }),
): EnginePlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, skills: skills(i) }));
}

/** A typical roster: guards, forwards, and a couple of centers. */
export function typicalRoster(n: number): EnginePlayer[] {
  return makePlayers(n, (i) => {
    switch (i % 4) {
      case 0:
        return { G: 3, F: 1 };
      case 1:
        return { G: 2 };
      case 2:
        return { F: 2, C: 2 };
      default:
        return { F: 3, C: 1 };
    }
  });
}

export function baseInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players: makePlayers(10),
    segmentCount: 8,
    requirement: {},
    rules: { ...ALL_RULES, positionCoverage: false },
    ...overrides,
  };
}

export function playedCounts(plan: Lineup[], players: EnginePlayer[]): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  for (const lineup of plan) for (const slot of lineup) counts[slot.playerId]! += 1;
  return counts;
}

/** Longest run of consecutive segments each player spent on the bench. */
export function longestBench(plan: Lineup[], players: EnginePlayer[]): Record<PlayerId, number> {
  const longest: Record<PlayerId, number> = {};
  for (const p of players) {
    let run = 0;
    let max = 0;
    for (const lineup of plan) {
      if (lineup.some((s) => s.playerId === p.id)) run = 0;
      else max = Math.max(max, ++run);
    }
    longest[p.id] = max;
  }
  return longest;
}

/** True when the lineup has enough distinct eligible players for each required position. */
export function lineupCovers(lineup: Lineup, players: EnginePlayer[], requirement: Record<string, number>): boolean {
  const byId = new Map(players.map((p) => [p.id, p]));
  // Shown positions must satisfy the requirement and be positions the player can play.
  const shown: Record<string, number> = {};
  for (const slot of lineup) {
    if (slot.positionId === null) continue;
    if (byId.get(slot.playerId)?.skills[slot.positionId] === undefined) return false;
    shown[slot.positionId] = (shown[slot.positionId] ?? 0) + 1;
  }
  return Object.entries(requirement).every(([pos, n]) => (shown[pos] ?? 0) >= n);
}
