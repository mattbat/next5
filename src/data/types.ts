import type { Lineup, Lock, PlayerId, PositionId, RuleSettings, SkillLevel, Slot, Warning } from '../engine';

/**
 * Stored records. Every record has a stable id and updatedAt so a sync layer
 * can be added later (REQUIREMENTS.md §16).
 */

interface Record {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Position {
  id: PositionId;
  name: string;
  /** One or two letters for tight spaces, e.g. "G". */
  short: string;
}

export interface GameFormat {
  periodType: 'quarters' | 'halves';
  segmentsPerPeriod: number;
}

export interface Team extends Record {
  name: string;
  positions: Position[];
  /** Minimum distinct eligible players per position in every lineup (P4). */
  requirement: Partial<{ [positionId: string]: number }>;
  defaultFormat: GameFormat;
  defaultRules: RuleSettings;
  archived: boolean;
}

export interface Player extends Record {
  teamId: string;
  name: string;
  number: string;
  /** Positions the player can play and their skill level at each (P2, P3). */
  skills: Partial<{ [positionId: string]: SkillLevel }>;
  active: boolean;
}

export type GameStatus = 'planned' | 'live' | 'final';

/**
 * A player's availability during a game (D5). Segment numbers are 0-based.
 * - out: injured or left; unavailable from `from` to the end of the game
 * - resting: unavailable for segments from `from` up to (not including) `until`
 * - arrived: late arrival; unavailable before `at`
 */
export type PlayerStatus =
  | { kind: 'out'; from: number }
  | { kind: 'resting'; from: number; until: number }
  | { kind: 'arrived'; at: number };

/** What changed from the plan during a game, for the game's history (S1, S2). */
export type GameEvent = { segment: number } & (
  | { kind: 'swap-now'; out: PlayerId; in: PlayerId }
  | { kind: 'swap-next'; out: PlayerId; in: PlayerId }
  | { kind: 'status'; playerId: PlayerId; status: PlayerStatus | null }
  | { kind: 'replan'; changes: number }
  | { kind: 'overtime'; added: number }
);

export interface Game extends Record {
  teamId: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  opponent: string;
  attending: PlayerId[];
  format: GameFormat;
  rules: RuleSettings;
  plan: Lineup[];
  warnings: Warning[];
  /** Seed used for the current plan, so Regenerate gives a new shuffle. */
  seed: number;
  status: GameStatus;
  /** Index of the segment on the court while live. */
  current: number;
  /**
   * What was actually on the court, one lineup per segment played (S1). A
   * segment with a mid-segment swap lists both players, so it can have more
   * than 5 entries: everyone who played part of it gets credit.
   */
  played: Lineup[];
  /** Players subbed out partway through the current segment (D4). */
  subbedOut: Slot[];
  /** Availability changes made during the game, by player (D5). */
  statuses: Partial<{ [playerId: PlayerId]: PlayerStatus }>;
  /** Log of changes from the plan (S1). */
  events: GameEvent[];
  /**
   * The coach's locks from planning (G6). Every regenerate and re-plan keeps
   * them; a player's game-day status wins over a lock-in.
   */
  locks: Lock[];
  /**
   * The plan as it stood when the game started, for "planned" in stats (S1,
   * S3). Missing for games started before it was recorded.
   */
  startPlan?: Lineup[];
  /** Handing the game between the coach's and assistant's phones (SH1–SH6). Missing: never handed off. */
  handoff?: Handoff;
}

/** This phone's side of a game handoff (SH3). */
export interface Handoff {
  /** Goes up by one with every send and every Take back control. */
  n: number;
  /** This phone's part: the coach plans and gets the game back; the assistant runs it. */
  role: 'coach' | 'assistant';
  /** Sent to the other phone and not back yet. */
  away: boolean;
  /** When this phone last sent the game. */
  sentAt?: number;
}
