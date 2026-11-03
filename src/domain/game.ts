import { generatePlan, type EnginePlayer, type GenerateError, type Lineup, type Warning } from '../engine';
import type { Game, GameFormat, Player, Position, Team } from '../data/types';

/** Pure game logic shared by the screens. No storage or UI here. */

export function periodCount(format: GameFormat): number {
  return format.periodType === 'quarters' ? 4 : 2;
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

export function toEnginePlayers(players: Player[]): EnginePlayer[] {
  return players.map((p) => ({ id: p.id, skills: p.skills }));
}

export type PlanOutcome = { ok: true; plan: Lineup[]; warnings: Warning[] } | { ok: false; error: GenerateError };

/**
 * Generates (or regenerates) a game's plan from the attending players.
 * Segments already played are always kept (D3).
 */
export function planGame(game: Game, team: Team, roster: Player[], seed?: number): PlanOutcome {
  const attending = roster.filter((p) => game.attending.includes(p.id));
  return generatePlan({
    players: toEnginePlayers(attending),
    segmentCount: Math.max(segmentCount(game.format), game.plan.length),
    requirement: team.requirement,
    rules: game.rules,
    fixed: game.played,
    seed,
  });
}

/** Human-readable explanation of a plan warning (H-5). */
export function describeWarning(warning: Warning, game: Game, names: Map<string, string>): string {
  const name = (id: string) => names.get(id) ?? 'Unknown player';
  const list = (ids: string[]) => ids.map(name).join(', ');
  switch (warning.kind) {
    case 'equal-time':
      return `Playing time isn't equal: ${list(warning.most)} play${warning.most.length === 1 ? 's' : ''} ${warning.spread} more segment${warning.spread === 1 ? '' : 's'} than ${list(warning.fewest)}. Usually this is because only a few players can cover a required position.`;
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
  }
}

/** Starts the game at the first segment. */
export function startGame(game: Game): Game {
  return { ...game, status: 'live', current: 0, played: [], subbedOut: [] };
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
  if (game.current + 1 >= game.plan.length) {
    return { ...game, played, subbedOut: [], current: game.plan.length - 1, status: 'final' };
  }
  return { ...game, played, subbedOut: [], current: game.current + 1 };
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
  return { ...game, played, subbedOut, current, status: 'live' };
}

export interface PlayerTime {
  playerId: string;
  planned: number;
  played: number;
}

/** Planned vs. played segments per attending player (S3). */
export function playingTime(game: Game): PlayerTime[] {
  return game.attending.map((playerId) => ({
    playerId,
    planned: game.plan.filter((l) => l.some((s) => s.playerId === playerId)).length,
    played: game.played.filter((l) => l.some((s) => s.playerId === playerId)).length,
  }));
}
