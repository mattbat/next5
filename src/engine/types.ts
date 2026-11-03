/**
 * Types for the rotation engine. The engine is pure TypeScript with no UI or
 * storage dependencies, so it can be tested in isolation (REQUIREMENTS.md Q-2).
 */

export type PlayerId = string;
export type PositionId = string;

/** 1 = Rising, 2 = Steady, 3 = Go-To (REQUIREMENTS.md §6). */
export type SkillLevel = 1 | 2 | 3;

export const COURT_SIZE = 5;

export interface EnginePlayer {
  id: PlayerId;
  /** Positions this player can play, with their skill level at each. */
  skills: Partial<Record<PositionId, SkillLevel>>;
}

/** Minimum number of distinct eligible players needed at each position. */
export type PositionRequirement = Partial<Record<PositionId, number>>;

export interface RuleSettings {
  /** H1 — position coverage. When false, positions are display-only. */
  positionCoverage: boolean;
  /** R1 — everyone's segment count within 1 of each other. */
  equalTime: boolean;
  /** R2 — no bench stretch longer than the roster requires. */
  limitBench: boolean;
  /** R3 — avoid stacking Rising players or bunching Go-To players. */
  balanceSkill: boolean;
}

export interface Slot {
  playerId: PlayerId;
  /** Position shown for this player in this segment, or null when the player has no positions. */
  positionId: PositionId | null;
}

/** One segment's lineup: exactly COURT_SIZE slots. */
export type Lineup = Slot[];

export interface GenerateInput {
  players: EnginePlayer[];
  segmentCount: number;
  requirement: PositionRequirement;
  rules: RuleSettings;
  /**
   * Segments that must be kept exactly as given (already played, or locked).
   * Generation starts at `fixed.length`.
   */
  fixed?: Lineup[];
  /** An earlier plan. Generation prefers to keep its lineups (fewest changes, §5). */
  previous?: Lineup[];
  /** Segment indices at which a player is unavailable. Missing = always available. */
  unavailable?: Partial<Record<PlayerId, number[]>>;
  /** Seed for repeatable shuffles. Different seeds give different valid plans. */
  seed?: number;
  /**
   * The coach's locks (G6): players who must be on the court, or must sit, in
   * a segment. Ignored for fixed segments. Availability wins over a lock-in,
   * and a lock-out wins over a lock-in for the same player and segment.
   */
  locks?: Lock[];
}

/** One player locked into (`in`) or out of (`out`) one segment (G6). Segments are 0-based. */
export interface Lock {
  segment: number;
  playerId: PlayerId;
  kind: 'in' | 'out';
}

export type Warning =
  | { kind: 'equal-time'; most: PlayerId[]; fewest: PlayerId[]; spread: number }
  | { kind: 'bench-streak'; playerId: PlayerId; startSegment: number; length: number; limit: number }
  | { kind: 'skill-stack'; segment: number };

export type GenerateError =
  | { kind: 'not-enough-players'; segment: number; available: number }
  | { kind: 'requirement-too-large'; total: number }
  | { kind: 'positions-uncoverable'; segment: number; missing: PositionId[] }
  /** Locks leave fewer than 5 players who can play the segment. */
  | { kind: 'too-many-locked-out'; segment: number; available: number }
  | { kind: 'too-many-locked-in'; segment: number; count: number }
  /** The players are there, but not with these locks. */
  | { kind: 'locks-uncoverable'; segment: number; missing: PositionId[] };

export type GenerateResult =
  | { ok: true; plan: Lineup[]; warnings: Warning[] }
  | { ok: false; error: GenerateError };
