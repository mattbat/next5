import { COURT_SIZE, type EnginePlayer, type Lineup, type PositionId, type PositionRequirement, type SkillLevel } from './types';

/** Expands { G: 2, C: 1 } into the list of required slots [G, G, C]. */
export function requiredSlots(requirement: PositionRequirement): PositionId[] {
  const slots: PositionId[] = [];
  for (const [positionId, count] of Object.entries(requirement)) {
    for (let i = 0; i < (count ?? 0); i++) slots.push(positionId);
  }
  return slots;
}

/**
 * Assigns distinct players to the required slots (bipartite matching).
 * Returns slot index -> player index, or null when no assignment exists.
 */
function matchSlots(players: EnginePlayer[], slots: PositionId[]): number[] | null {
  const slotOwner: number[] = new Array(slots.length).fill(-1);

  const tryPlayer = (p: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slots.length; s++) {
      if (seen[s] || players[p]!.skills[slots[s]!] === undefined) continue;
      seen[s] = true;
      if (slotOwner[s] === -1 || tryPlayer(slotOwner[s]!, seen)) {
        slotOwner[s] = p;
        return true;
      }
    }
    return false;
  };

  let matched = 0;
  for (let p = 0; p < players.length && matched < slots.length; p++) {
    if (tryPlayer(p, new Array(slots.length).fill(false))) matched++;
  }
  return matched === slots.length ? slotOwner : null;
}

/** True when these players can cover every required slot with distinct players. */
export function canCover(players: EnginePlayer[], slots: PositionId[]): boolean {
  if (slots.length === 0) return true;
  if (players.length < slots.length) return false;
  return matchSlots(players, slots) !== null;
}

function* subsets<T>(items: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i <= items.length - (k - picked.length); i++) {
    picked.push(items[i]!);
    yield* subsets(items, k, i + 1, picked);
    picked.pop();
  }
}

/**
 * True when a full lineup that includes every `forced` player, filled from
 * `others`, can cover the slots (locks, G6). Rosters are at most ~15, so
 * trying every fill is cheap.
 */
export function canCoverWith(forced: EnginePlayer[], others: EnginePlayer[], slots: PositionId[]): boolean {
  if (slots.length === 0) return true;
  const free = COURT_SIZE - forced.length;
  if (free < 0 || others.length < free) return false;
  if (forced.length === 0) return canCover(others, slots);
  for (const fill of subsets(others, free)) {
    if (canCover([...forced, ...fill], slots)) return true;
  }
  return false;
}

/** Positions that locks make impossible to cover, for error messages. */
export function missingWithLocks(
  forced: EnginePlayer[],
  others: EnginePlayer[],
  requirement: PositionRequirement,
): PositionId[] {
  const missing = Object.keys(requirement).filter(
    (id) => (requirement[id] ?? 0) > 0 && !canCoverWith(forced, others, requiredSlots({ [id]: requirement[id] })),
  );
  return missing.length > 0 ? missing : Object.keys(requirement).filter((id) => (requirement[id] ?? 0) > 0);
}

/** Positions whose requirement can't be met by these players, for error messages. */
export function missingPositions(players: EnginePlayer[], requirement: PositionRequirement): PositionId[] {
  const missing: PositionId[] = [];
  for (const [positionId, count] of Object.entries(requirement)) {
    const eligible = players.filter((p) => p.skills[positionId] !== undefined).length;
    if (eligible < (count ?? 0)) missing.push(positionId);
  }
  if (missing.length > 0) return missing;
  // Every position has enough eligible players on its own, but not all at once.
  return Object.keys(requirement).filter((id) => (requirement[id] ?? 0) > 0);
}

function bestPosition(player: EnginePlayer): PositionId | null {
  let best: PositionId | null = null;
  let bestSkill = 0;
  for (const [positionId, skill] of Object.entries(player.skills)) {
    if ((skill ?? 0) > bestSkill) {
      best = positionId;
      bestSkill = skill ?? 0;
    }
  }
  return best;
}

/**
 * Gives each player in a 5-player lineup the position they'll be shown at.
 * Required slots are filled first, preferring higher skill (P5); everyone else
 * gets their best position. Returns null if the requirement can't be met.
 */
export function assignPositions(players: EnginePlayer[], slots: PositionId[]): Lineup | null {
  let bestScore = -1;
  let bestAssignment: (PositionId | null)[] | null = null;
  const assignment: (PositionId | null)[] = new Array(players.length).fill(null);
  const used: boolean[] = new Array(players.length).fill(false);

  // Slots are at most 5 and players exactly 5, so exhaustive search is cheap.
  const search = (s: number, score: number) => {
    if (s === slots.length) {
      if (score > bestScore) {
        bestScore = score;
        bestAssignment = [...assignment];
      }
      return;
    }
    for (let p = 0; p < players.length; p++) {
      const skill: SkillLevel | undefined = players[p]!.skills[slots[s]!];
      if (used[p] || skill === undefined) continue;
      used[p] = true;
      assignment[p] = slots[s]!;
      search(s + 1, score + skill);
      used[p] = false;
      assignment[p] = null;
    }
  };
  search(0, 0);

  const chosen = bestAssignment as (PositionId | null)[] | null;
  if (chosen === null) return null;
  return players.map((player, i) => ({
    playerId: player.id,
    positionId: chosen[i] ?? bestPosition(player),
  }));
}
