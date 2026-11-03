import type { Lineup, PlayerId, PositionId, RuleSettings, SkillLevel, Warning } from '../engine';

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
  /** What was actually on the court, one lineup per segment played (S1). */
  played: Lineup[];
}
