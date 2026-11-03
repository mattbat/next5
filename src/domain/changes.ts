import {
  assignPositions,
  canCover,
  generatePlan,
  missingPositions,
  requiredSlots,
  type Lineup,
  type PlayerId,
  type Warning,
} from '../engine';
import type { Game, GameEvent, Player, PlayerStatus, Team } from '../data/types';
import { describeError, segmentLabel, toEnginePlayers } from './game';

/**
 * Game-day changes (REQUIREMENTS.md D3–D6, D11): swaps, player status,
 * re-planning and overtime. All pure: each takes a game and returns a new one.
 * Segments already played are never changed (D3).
 */

export type ChangeResult = { ok: true; game: Game } | { ok: false; message: string };

/** Whether a player with this status can play in a segment. */
export function availableAt(status: PlayerStatus | undefined, segment: number): boolean {
  if (!status) return true;
  switch (status.kind) {
    case 'out':
      return segment < status.from;
    case 'resting':
      return segment < status.from || segment >= status.until;
    case 'arrived':
      return segment >= status.at;
  }
}

/** Segments each player can't play, for the engine, over the first `count` segments. */
export function unavailableSegments(game: Game, count: number): Partial<Record<PlayerId, number[]>> {
  const result: Partial<Record<PlayerId, number[]>> = {};
  for (const [playerId, status] of Object.entries(game.statuses)) {
    const segments: number[] = [];
    for (let s = 0; s < count; s++) if (!availableAt(status, s)) segments.push(s);
    if (segments.length > 0) result[playerId] = segments;
  }
  return result;
}

/** Attending players who aren't on the court in a segment and are available for it. */
export function benchFor(game: Game, segment: number): PlayerId[] {
  const onCourt = new Set(game.plan[segment]?.map((s) => s.playerId));
  return game.attending.filter((id) => !onCourt.has(id) && availableAt(game.statuses[id], segment));
}

/** Upcoming lineups that include a player who is now unavailable. */
export function planConflicts(game: Game): { playerId: PlayerId; segment: number }[] {
  const conflicts: { playerId: PlayerId; segment: number }[] = [];
  game.plan.forEach((lineup, segment) => {
    if (segment <= game.current) return;
    for (const slot of lineup) {
      if (!availableAt(game.statuses[slot.playerId], segment)) conflicts.push({ playerId: slot.playerId, segment });
    }
  });
  return conflicts;
}

function slotsFor(game: Game, team: Team): string[] {
  return game.rules.positionCoverage ? requiredSlots(team.requirement) : [];
}

function nameOf(roster: Player[], id: PlayerId): string {
  return roster.find((p) => p.id === id)?.name ?? 'That player';
}

/**
 * Replaces one player in a lineup and reassigns positions. Fails with a
 * plain-language reason when the swap would leave a required position
 * uncovered (H1 is never broken, even by hand).
 */
function swapInLineup(
  lineup: Lineup,
  outId: PlayerId,
  inId: PlayerId,
  game: Game,
  team: Team,
  roster: Player[],
): { ok: true; lineup: Lineup } | { ok: false; message: string } {
  const ids = lineup.map((s) => (s.playerId === outId ? inId : s.playerId));
  const players = toEnginePlayers(ids.map((id) => roster.find((p) => p.id === id)).filter((p): p is Player => !!p));
  const slots = slotsFor(game, team);
  const next = players.length === ids.length && canCover(players, slots) ? assignPositions(players, slots) : null;
  if (!next) {
    const missing = missingPositions(players, team.requirement)
      .map((id) => team.positions.find((p) => p.id === id)?.name ?? id)
      .join(' and ');
    return {
      ok: false,
      message: `Swapping ${nameOf(roster, inId)} in for ${nameOf(roster, outId)} would leave no one to play ${missing}. Pick a different player.`,
    };
  }
  return { ok: true, lineup: next };
}

function withEvent(game: Game, event: GameEvent): Game {
  return { ...game, events: [...game.events, event] };
}

/**
 * Swap now (D4): a player comes off during the current segment. Both players
 * get credit for the segment.
 */
export function swapNow(game: Game, team: Team, roster: Player[], outId: PlayerId, inId: PlayerId): ChangeResult {
  const lineup = game.plan[game.current];
  if (game.status !== 'live' || !lineup) return { ok: false, message: 'The game is not in progress.' };
  if (!lineup.some((s) => s.playerId === outId)) return { ok: false, message: `${nameOf(roster, outId)} is not on the court.` };
  if (!benchFor(game, game.current).includes(inId)) {
    return { ok: false, message: `${nameOf(roster, inId)} is not available to come in.` };
  }
  const swapped = swapInLineup(lineup, outId, inId, game, team, roster);
  if (!swapped.ok) return swapped;

  const leaving = lineup.find((s) => s.playerId === outId)!;
  const subbedOut = [...game.subbedOut.filter((s) => s.playerId !== inId), leaving];
  const plan = game.plan.map((l, i) => (i === game.current ? swapped.lineup : l));
  return {
    ok: true,
    game: withEvent({ ...game, plan, subbedOut }, { kind: 'swap-now', segment: game.current, out: outId, in: inId }),
  };
}

/** Changes who comes in at the next substitution (D4). */
export function swapNext(game: Game, team: Team, roster: Player[], outId: PlayerId, inId: PlayerId): ChangeResult {
  const segment = game.current + 1;
  const lineup = game.plan[segment];
  if (game.status !== 'live' || !lineup) return { ok: false, message: 'There is no next lineup to change.' };
  if (!lineup.some((s) => s.playerId === outId)) {
    return { ok: false, message: `${nameOf(roster, outId)} is not in the next lineup.` };
  }
  if (!benchFor(game, segment).includes(inId)) {
    return { ok: false, message: `${nameOf(roster, inId)} is not available for the next lineup.` };
  }
  const swapped = swapInLineup(lineup, outId, inId, game, team, roster);
  if (!swapped.ok) return swapped;
  const plan = game.plan.map((l, i) => (i === segment ? swapped.lineup : l));
  return { ok: true, game: withEvent({ ...game, plan }, { kind: 'swap-next', segment, out: outId, in: inId }) };
}

/**
 * Sets or clears a player's status (D5). Takes effect from the next segment:
 * the current one is already being played.
 */
export function setStatus(
  game: Game,
  playerId: PlayerId,
  change: { kind: 'out' } | { kind: 'resting'; segments: number } | null,
): Game {
  const from = game.current + 1;
  const statuses = { ...game.statuses };
  let status: PlayerStatus | null = null;
  if (change === null) delete statuses[playerId];
  else {
    status = change.kind === 'out' ? { kind: 'out', from } : { kind: 'resting', from, until: from + change.segments };
    statuses[playerId] = status;
  }
  return withEvent({ ...game, statuses }, { kind: 'status', segment: game.current, playerId, status });
}

/** A player who wasn't marked attending arrives; they can play from the next segment (D5). */
export function markArrived(game: Game, playerId: PlayerId): Game {
  if (game.attending.includes(playerId)) return game;
  const status: PlayerStatus = { kind: 'arrived', at: game.current + 1 };
  return withEvent(
    { ...game, attending: [...game.attending, playerId], statuses: { ...game.statuses, [playerId]: status } },
    { kind: 'status', segment: game.current, playerId, status },
  );
}

/** Segments after the current one whose players differ between two plans. */
export function changedSegments(before: Lineup[], after: Lineup[], from: number): number[] {
  const changed: number[] = [];
  for (let s = from; s < after.length; s++) {
    const a = new Set(before[s]?.map((x) => x.playerId));
    if (after[s]!.length !== a.size || after[s]!.some((x) => !a.has(x.playerId))) changed.push(s);
  }
  return changed;
}

export type ReplanResult =
  | { ok: true; game: Game; changed: number[]; warnings: Warning[] }
  | { ok: false; message: string };

/** The engine input shared by re-planning and overtime. */
function engineInput(game: Game, team: Team, roster: Player[], segmentCount: number) {
  const attending = roster.filter((p) => game.attending.includes(p.id));
  return {
    players: toEnginePlayers(attending),
    requirement: team.requirement,
    rules: game.rules,
    segmentCount,
    unavailable: unavailableSegments(game, segmentCount),
  };
}

/** The current segment as it will be recorded, including anyone subbed out of it. */
function currentAsPlayed(game: Game): Lineup {
  return [...game.plan[game.current]!, ...game.subbedOut];
}

/**
 * Re-plan from here (D6): rebuilds every segment after the current one around
 * the current statuses, keeping played segments and the current lineup, and
 * changing as little as possible. Returns a preview; nothing is saved.
 */
export function replan(game: Game, team: Team, roster: Player[], seed?: number): ReplanResult {
  if (game.status !== 'live') return { ok: false, message: 'The game is not in progress.' };
  const result = generatePlan({
    ...engineInput(game, team, roster, game.plan.length),
    fixed: [...game.played, currentAsPlayed(game)],
    previous: game.plan,
    seed,
  });
  if (!result.ok) return { ok: false, message: describeError(result.error, game, team.positions) };

  // Keep the stored lineups for played and current segments exactly as they were.
  const plan = [...game.plan.slice(0, game.current + 1), ...result.plan.slice(game.current + 1)];
  const changed = changedSegments(game.plan, plan, game.current + 1);
  const next = withEvent({ ...game, plan, warnings: result.warnings }, {
    kind: 'replan',
    segment: game.current,
    changes: changed.length,
  });
  return { ok: true, game: next, changed, warnings: result.warnings };
}

/** Overtime / extra segments (D11): adds segments at the end, planned with the same rules. */
export function addSegments(game: Game, team: Team, roster: Player[], count = 1): ChangeResult {
  if (game.status !== 'live') return { ok: false, message: 'The game is not in progress.' };
  const result = generatePlan({
    ...engineInput(game, team, roster, game.plan.length + count),
    fixed: [...game.played, currentAsPlayed(game), ...game.plan.slice(game.current + 1)],
  });
  if (!result.ok) return { ok: false, message: describeError(result.error, game, team.positions) };
  const plan = [...game.plan, ...result.plan.slice(game.plan.length)];
  return {
    ok: true,
    game: withEvent({ ...game, plan, warnings: result.warnings }, { kind: 'overtime', segment: game.current, added: count }),
  };
}

/** Short description of a player's status for lists (D5); null when it no longer applies. */
export function statusLabel(status: PlayerStatus | undefined, game: Game): string | null {
  if (!status) return null;
  switch (status.kind) {
    case 'out':
      return 'Out for the game';
    case 'resting':
      return status.until > game.current
        ? `Resting until ${segmentLabel(game.format, status.until).text}`
        : null;
    case 'arrived':
      return status.at > game.current ? `Arrived, plays from ${segmentLabel(game.format, status.at).text}` : null;
  }
}
