import { generatePlan, type EnginePlayer, type GenerateError, type Lineup, type Lock, type Warning } from '../engine';
import type { ChangeSnapshot, Game, GameFormat, Player, Position, Team } from '../data/types';

/** Pure game logic shared by the screens. No storage or UI here. */

export function periodCount(format: GameFormat): number {
  return format.periodType === 'quarters' ? 4 : 2;
}

/** A game's yyyy-mm-dd date for people, e.g. "Sat, Nov 7". Anything else comes back as it was. */
export function formatGameDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function segmentCount(format: GameFormat): number {
  return periodCount(format) * format.segmentsPerPeriod;
}

export interface SegmentLabel {
  /** "Q2" or "H1" */
  period: string;
  /** 1-based segment within the period. */
  part: number;
  of: number;
  /** "Q2 · 2 of 2", or just "Q2" with one segment per period. */
  text: string;
}

export function segmentLabel(format: GameFormat, index: number): SegmentLabel {
  const regular = segmentCount(format);
  if (index >= regular) {
    const ot = index - regular + 1;
    return { period: `OT${ot}`, part: 1, of: 1, text: `OT${ot}` };
  }
  const periodNumber = Math.floor(index / format.segmentsPerPeriod) + 1;
  const period = `${format.periodType === 'quarters' ? 'Q' : 'H'}${periodNumber}`;
  const part = (index % format.segmentsPerPeriod) + 1;
  const of = format.segmentsPerPeriod;
  return { period, part, of, text: of === 1 ? period : `${period} · ${part} of ${of}` };
}

/**
 * Display order for a lineup: by position in the team's order (Guards, then
 * Forwards, then Centers), then alphabetically by name. Keeps the same five
 * in the same order from segment to segment.
 */
export function sortLineup(lineup: Lineup, positions: Position[], byId: Map<string, Player>): Lineup {
  const rank = (positionId: string | null) => {
    const i = positions.findIndex((p) => p.id === positionId);
    return i === -1 ? positions.length : i;
  };
  const name = (id: string) => byId.get(id)?.name ?? '';
  return [...lineup].sort(
    (a, b) => rank(a.positionId) - rank(b.positionId) || name(a.playerId).localeCompare(name(b.playerId)),
  );
}

export function toEnginePlayers(players: Player[]): EnginePlayer[] {
  return players.map((p) => ({ id: p.id, skills: p.skills }));
}

/**
 * The game's locks that still apply (G6): for attending players and within
 * the plan. Locks for players who stopped attending are ignored.
 */
export function activeLocks(game: Game, count: number): Lock[] {
  return game.locks.filter((l) => l.segment < count && game.attending.includes(l.playerId));
}

export type PlanOutcome = { ok: true; plan: Lineup[]; warnings: Warning[] } | { ok: false; error: GenerateError };

/**
 * Generates (or regenerates) a game's plan from the attending players.
 * Segments already played and the coach's locks are always kept (D3, G8).
 */
export function planGame(game: Game, team: Team, roster: Player[], seed?: number): PlanOutcome {
  const attending = roster.filter((p) => game.attending.includes(p.id));
  const count = Math.max(segmentCount(game.format), game.plan.length);
  return generatePlan({
    players: toEnginePlayers(attending),
    segmentCount: count,
    locks: activeLocks(game, count),
    requirement: team.requirement,
    rules: game.rules,
    fixed: game.played,
    seed,
  });
}

/** The likeliest reason playing time couldn't be equal, for the warning (H-5). */
function equalTimeReason(game: Game): string {
  if (activeLocks(game, game.plan.length).length > 0) {
    return 'Your locks may be the reason: unlocking someone usually evens it out.';
  }
  if (game.rules.positionCoverage) return 'Usually this is because only a few players can cover a required position.';
  return 'Usually this is because players were out, resting or arrived late.';
}

/** Human-readable explanation of a plan warning (H-5). */
export function describeWarning(warning: Warning, game: Game, names: Map<string, string>): string {
  const name = (id: string) => names.get(id) ?? 'Unknown player';
  const list = (ids: string[]) => ids.map(name).join(', ');
  switch (warning.kind) {
    case 'equal-time':
      return `Playing time isn't equal: ${list(warning.most)} play${warning.most.length === 1 ? 's' : ''} ${warning.spread} more segment${warning.spread === 1 ? '' : 's'} than ${list(warning.fewest)}. ${equalTimeReason(game)}`;
    case 'bench-streak': {
      const from = segmentLabel(game.format, warning.startSegment).text;
      return `${name(warning.playerId)} sits ${warning.length} segments in a row starting ${from} (the limit is ${warning.limit}).`;
    }
    case 'skill-stack':
      return `${segmentLabel(game.format, warning.segment).text} has an unbalanced mix of skill levels.`;
  }
}

/** Human-readable explanation of why a plan couldn't be made (H-5). */
export function describeError(error: GenerateError, game: Game, positions: Position[]): string {
  const posName = (id: string) => positions.find((p) => p.id === id)?.name ?? id;
  switch (error.kind) {
    case 'not-enough-players':
      return `Only ${error.available} players are available — you need at least 5. Mark more players as attending.`;
    case 'requirement-too-large':
      return `The position requirement adds up to ${error.total} players, but only 5 are on the court. Lower it in the team settings.`;
    case 'positions-uncoverable': {
      const missing = error.missing.map(posName).join(' and ');
      const when = segmentLabel(game.format, error.segment).text;
      return `Not enough attending players can play ${missing} (needed from ${when}). Mark another player as able to play ${missing}, or lower the requirement in the team settings.`;
    }
    case 'too-many-locked-out':
      return `Too many players are locked out of ${segmentLabel(game.format, error.segment).text}: only ${error.available} are left to play. Unlock someone in that segment.`;
    case 'too-many-locked-in':
      return `${error.count} players are locked in for ${segmentLabel(game.format, error.segment).text}, but only 5 fit on the court. Unlock someone in that segment.`;
    case 'locks-uncoverable': {
      const missing = error.missing.map(posName).join(' and ');
      const when = segmentLabel(game.format, error.segment).text;
      return `With the locks in ${when}, nobody left can play ${missing}. Unlock a player there, or lock in someone who plays ${missing}.`;
    }
  }
}

/** Starts the game at the first segment. */
export function startGame(game: Game): Game {
  return { ...game, status: 'live', current: 0, played: [], subbedOut: [], startPlan: game.plan };
}

/**
 * Tapping Next (D1): records who was on the court and moves on. Players
 * subbed out partway through the segment are recorded too, so they get
 * credit for it (D4). On the last segment this ends the game.
 */
export function nextSegment(game: Game): Game {
  if (game.status !== 'live') return game;
  const onCourt = game.plan[game.current];
  if (!onCourt) return game;
  const played = [...game.played, [...onCourt, ...game.subbedOut]];
  // After Next, Undo means "take back Next", not the change before it.
  const rest = withoutLastChange(game);
  if (game.current + 1 >= game.plan.length) {
    return { ...rest, played, subbedOut: [], current: game.plan.length - 1, status: 'final' };
  }
  return { ...rest, played, subbedOut: [], current: game.current + 1 };
}

function withoutLastChange(game: Game): Game {
  const copy = { ...game };
  delete copy.lastChange;
  return copy;
}

const snapshotOf = (game: Game): ChangeSnapshot => ({
  plan: game.plan,
  subbedOut: game.subbedOut,
  statuses: game.statuses,
  attending: game.attending,
  locks: game.locks,
  events: game.events,
  warnings: game.warnings,
});

/**
 * Remembers how the game was before a game-day change (a swap, status,
 * re-plan or overtime), so Undo can take that change back (D2). Only the
 * last change is kept.
 */
export function withUndo(before: Game, after: Game, label: string): Game {
  return { ...after, lastChange: { label, before: snapshotOf(before) } };
}

/**
 * Undo (D2): takes back the last thing done on game day. That's the last
 * change if there was one since Next (a swap's credit goes too), otherwise
 * the last Next.
 */
export function undoLast(game: Game): Game {
  if (game.status === 'live' && game.lastChange) return { ...withoutLastChange(game), ...game.lastChange.before };
  return undoSegment(game);
}

/** What Undo would take back, for its label; null when there's nothing to undo. */
export function undoLabel(game: Game): string | null {
  if (game.status === 'live' && game.lastChange) return game.lastChange.label;
  return game.played.length > 0 ? 'Next' : null;
}

/**
 * End game now (D9), when time runs out before the plan does: the segment on
 * the court counts as played and the rest of the plan isn't recorded. Undo
 * end of game reopens it at the same segment.
 */
export function endGameEarly(game: Game): Game {
  if (game.status !== 'live' || game.current + 1 >= game.plan.length) return nextSegment(game);
  const ended = nextSegment({ ...game, plan: game.plan.slice(0, game.current + 1) });
  return {
    ...ended,
    plan: game.plan,
    events: [...game.events, { kind: 'ended-early', segment: game.current }],
  };
}

/** True when the game ended before its last planned segment (D9). */
export function endedEarly(game: Game): boolean {
  return game.status === 'final' && game.events.at(-1)?.kind === 'ended-early';
}

/** Undo (D2): reverses the last Next, including reopening a game that just ended. */
export function undoSegment(game: Game): Game {
  const last = game.played.at(-1);
  if (!last) return game;
  const played = game.played.slice(0, -1);
  const current = played.length;
  // Anyone recorded beyond the segment's lineup had been subbed out mid-segment.
  const onCourt = new Set(game.plan[current]?.map((s) => s.playerId));
  const subbedOut = last.filter((s) => !onCourt.has(s.playerId));
  const events = endedEarly(game) ? game.events.slice(0, -1) : game.events;
  // A change remembered for Undo belongs to the segment being left; restoring
  // it later would bring back that segment's subbed-out players.
  return { ...withoutLastChange(game), played, subbedOut, current, status: 'live', events };
}


