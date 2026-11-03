import { canCover, generatePlan, requiredSlots, type Lineup, type Lock, type PlayerId, type Warning } from '../engine';
import type { Game, Player, Team } from '../data/types';
import { changedSegments, warningKey } from './changes';
import { activeLocks, describeError, segmentLabel, toEnginePlayers } from './game';

/**
 * Pregame plan editing (REQUIREMENTS.md G6–G9): locks, swaps and regenerating
 * from a segment. All pure: each takes a game and returns a new one.
 *
 * Every edit is kept as a lock, so the plan is re-filled around the coach's
 * choices straight away (G7, auto-fill), changing as little as possible.
 */

export type PlanEdit =
  | {
      ok: true;
      game: Game;
      /** Segments whose players changed. */
      changed: number[];
      /** Rule warnings the edit adds. */
      newWarnings: Warning[];
    }
  | { ok: false; message: string };

/** The lock on a player in a segment, if any. */
export function lockOf(game: Game, segment: number, playerId: PlayerId): Lock['kind'] | null {
  return game.locks.find((l) => l.segment === segment && l.playerId === playerId)?.kind ?? null;
}

/** Locks that apply to one segment. */
export function segmentLocks(game: Game, segment: number): Lock[] {
  return activeLocks(game, game.plan.length).filter((l) => l.segment === segment);
}

/** True when a segment's whole lineup is locked in. */
export function isLineupLocked(game: Game, segment: number): boolean {
  const lineup = game.plan[segment] ?? [];
  return lineup.length > 0 && lineup.every((s) => lockOf(game, segment, s.playerId) === 'in');
}

/** True when a plan already meets every lock, so no re-fill is needed. */
function meetsLocks(plan: Lineup[], locks: Lock[]): boolean {
  return locks.every((l) => {
    const onCourt = plan[l.segment]?.some((s) => s.playerId === l.playerId) ?? false;
    return l.kind === 'in' ? onCourt : !onCourt;
  });
}

function withoutLock(locks: Lock[], segment: number, playerId: PlayerId): Lock[] {
  return locks.filter((l) => !(l.segment === segment && l.playerId === playerId));
}

interface RefillOptions {
  /** Segments before this one are kept exactly. */
  from?: number;
  /** A new shuffle instead of the fewest changes. */
  fresh?: boolean;
  /** The plan to stay close to; defaults to the current plan. */
  previous?: Lineup[];
  /** Re-fill even when the plan already meets the locks. */
  force?: boolean;
}

/** Re-fills the plan around a new set of locks. Nothing is saved. */
function refill(game: Game, team: Team, roster: Player[], locks: Lock[], options: RefillOptions = {}): PlanEdit {
  const { from = 0, fresh = false, previous = game.plan, force = false } = options;
  const next = { ...game, locks };
  const count = game.plan.length;
  if (!fresh && !force && meetsLocks(game.plan, activeLocks(next, count))) {
    return { ok: true, game: next, changed: [], newWarnings: [] };
  }
  const seed = fresh ? game.seed + 1 : game.seed;
  const result = generatePlan({
    players: toEnginePlayers(roster.filter((p) => game.attending.includes(p.id))),
    segmentCount: count,
    requirement: team.requirement,
    rules: game.rules,
    fixed: game.plan.slice(0, from),
    previous: fresh ? undefined : previous,
    locks: activeLocks(next, count),
    seed,
  });
  if (!result.ok) return { ok: false, message: describeError(result.error, game, team.positions) };
  const existing = new Set(game.warnings.map(warningKey));
  return {
    ok: true,
    game: { ...next, plan: result.plan, warnings: result.warnings, seed },
    changed: changedSegments(game.plan, result.plan, 0),
    newWarnings: result.warnings.filter((w) => !existing.has(warningKey(w))),
  };
}

/**
 * Locks a player into or out of a segment (G6) and re-fills the plan around
 * it (G7). Locking out someone on the court brings in a replacement; locking
 * in someone on the bench sends someone else to the bench.
 */
export function setLock(
  game: Game,
  team: Team,
  roster: Player[],
  segment: number,
  playerId: PlayerId,
  kind: Lock['kind'],
): PlanEdit {
  return refill(game, team, roster, [...withoutLock(game.locks, segment, playerId), { segment, playerId, kind }]);
}

/** Removes a player's lock. The plan stays as it is: it already fits fewer locks. */
export function unlock(game: Game, segment: number, playerId: PlayerId): Game {
  return { ...game, locks: withoutLock(game.locks, segment, playerId) };
}

/** Locks the whole lineup of a segment, e.g. a closing five (G6). */
export function lockLineup(game: Game, segment: number): Game {
  const lineup = game.plan[segment] ?? [];
  const others = game.locks.filter((l) => l.segment !== segment);
  return { ...game, locks: [...others, ...lineup.map((s): Lock => ({ segment, playerId: s.playerId, kind: 'in' }))] };
}

/** Removes every lock in a segment. */
export function unlockSegment(game: Game, segment: number): Game {
  return { ...game, locks: game.locks.filter((l) => l.segment !== segment) };
}

/** Removes every lock in the game. */
export function clearLocks(game: Game): Game {
  return { ...game, locks: [] };
}

/**
 * Swaps a bench player in for a player on the court in one segment (G9). The
 * swap is kept as locks (in for the incoming player, out for the other) and
 * the rest of the plan is re-filled around it. A swap that leaves a required
 * position uncovered is refused (H1); other rules it breaks come back in
 * `newWarnings` for the screen to confirm.
 */
export function swapInPlan(
  game: Game,
  team: Team,
  roster: Player[],
  segment: number,
  outId: PlayerId,
  inId: PlayerId,
): PlanEdit {
  const lineup = game.plan[segment];
  const name = (id: PlayerId) => roster.find((p) => p.id === id)?.name ?? 'That player';
  if (!lineup?.some((s) => s.playerId === outId)) {
    return { ok: false, message: `${name(outId)} isn't on the court then.` };
  }
  if (lineup.some((s) => s.playerId === inId) || !game.attending.includes(inId)) {
    return { ok: false, message: `${name(inId)} can't come in then.` };
  }
  const ids = lineup.map((s) => (s.playerId === outId ? inId : s.playerId));
  if (game.rules.positionCoverage) {
    const five = toEnginePlayers(ids.map((id) => roster.find((p) => p.id === id)).filter((p): p is Player => !!p));
    if (!canCover(five, requiredSlots(team.requirement))) {
      const when = segmentLabel(game.format, segment).text;
      const position = team.positions.find((p) => p.id === lineup.find((s) => s.playerId === outId)!.positionId);
      const hint = position ? ` Pick someone who plays ${position.name}.` : '';
      return {
        ok: false,
        message: `That swap would leave ${when} without the required positions covered, so it can't be made.${hint}`,
      };
    }
  }
  const locks = [
    ...withoutLock(withoutLock(game.locks, segment, outId), segment, inId),
    { segment, playerId: inId, kind: 'in' as const },
    { segment, playerId: outId, kind: 'out' as const },
  ];
  // Stay close to the swapped lineup, so the other four keep their spots, and
  // re-fill so playing time evens out elsewhere (G7).
  const swapped = lineup.map((s) => (s.playerId === outId ? { playerId: inId, positionId: s.positionId } : s));
  const previous = game.plan.map((l, i) => (i === segment ? swapped : l));
  return refill(game, team, roster, locks, { previous, force: true });
}

/**
 * Regenerate from segment N onward (G8): keeps every segment before N and all
 * locks, and shuffles the rest for a new option.
 */
export function shuffleFrom(game: Game, team: Team, roster: Player[], from: number): PlanEdit {
  return refill(game, team, roster, game.locks, { from, fresh: true });
}
