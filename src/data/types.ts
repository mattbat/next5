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
  /** Equipment that goes to every practice (PR6). Missing: the defaults. */
  alwaysBring?: string[];
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
  /** The game was ended before the last segment (D9); later segments weren't played. */
  | { kind: 'ended-early' }
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
  /**
   * The game as it was before the last game-day change (a swap, status,
   * re-plan or overtime), so Undo can put it back (D2). Cleared by Next.
   * Missing: the last thing done was Next, or nothing yet.
   */
  lastChange?: LastChange;
}

/** The parts of a game a game-day change touches, kept for Undo (D2). */
export type ChangeSnapshot = Pick<Game, 'plan' | 'subbedOut' | 'statuses' | 'attending' | 'locks' | 'events' | 'warnings'>;

export interface LastChange {
  /** What it was, for the Undo button's label, e.g. "Sub out now". */
  label: string;
  before: ChangeSnapshot;
}

// Practice planning (PR1–PR11)

export type Court = 'half' | 'full';

/** A drill in the library, shared by all teams (PR2). */
export interface Drill extends Record {
  name: string;
  /** Default length in minutes. */
  minutes: number;
  court: Court;
  /** e.g. Defense, Offense, Inbounding. */
  tags: string[];
  equipment: string[];
  /** Coaching points. */
  notes: string;
  /** Hidden from the drill picker; kept in stats. */
  retired: boolean;
  /** Which starter drill this came from (PR3), so adding them again skips it. */
  starter?: string;
}

/** Who goes to a station: everyone, or scrimmage team A or B (PR5). */
export type StationGroup = 'all' | 'A' | 'B';

/** One drill in a block; several stations in a block run at the same time (PR4). */
export interface Station {
  drillId: string;
  /** Which coach runs it, e.g. "Coach Sam". Optional. */
  coach: string;
  group: StationGroup;
  /** How it went (PR8). */
  rating?: 'up' | 'down';
  note?: string;
}

export interface PracticeBlock {
  id: string;
  minutes: number;
  stations: Station[];
  skipped: boolean;
  /** How long it really took, once finished (PR7). */
  actualSeconds?: number;
}

export type PracticeStatus = 'planned' | 'live' | 'done';

/**
 * The current block's timer (PR7), stored so it keeps going if the app is
 * closed. Running: `elapsed` ms before `startedAt`, plus the time since.
 */
export interface PracticeClock {
  startedAt: number | null;
  elapsed: number;
}

export interface Practice extends Record {
  teamId: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  /** Start time, "18:00", or '' if not set. */
  time: string;
  /** Target length in minutes. */
  length: number;
  focus: string;
  /** Shown on the parent one-pager (PR10). */
  parentNote: string;
  attending: PlayerId[];
  blocks: PracticeBlock[];
  /** Scrimmage teams (PR5). Empty until split. */
  teams: { A: PlayerId[]; B: PlayerId[] };
  status: PracticeStatus;
  /** Index of the block running while live. */
  current: number;
  clock: PracticeClock;
  wentWell: string;
  improve: string;
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
