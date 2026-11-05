/**
 * Shape checks for teams, players and games that arrive from outside this
 * phone: a backup file (B2) or a shared game (SH3). Anyone can send a file or
 * a link, so a damaged or made-up one must be turned away before it's saved,
 * rather than crash a screen or freeze the app later (C4).
 *
 * Fields are checked when present: backups from older versions can lack
 * fields that were added later (db.ts fills those in).
 */

type Check = (value: unknown) => boolean;

// Generous limits: real games are at most about 30 segments, and a played
// segment lists 5 players plus anyone subbed out partway through.
const MAX_SEGMENTS = 60;
const MAX_LINEUP = 40;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString: Check = (value) => typeof value === 'string';
const isBoolean: Check = (value) => typeof value === 'boolean';
const isNumber: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const isCount =
  (max = Number.MAX_SAFE_INTEGER): Check =>
  (value) =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
const oneOf =
  (...options: unknown[]): Check =>
  (value) =>
    options.includes(value);
const listOf =
  (item: Check, max = Number.MAX_SAFE_INTEGER): Check =>
  (value) =>
    Array.isArray(value) && value.length <= max && value.every(item);
const recordOf =
  (item: Check): Check =>
  (value) =>
    isObject(value) && Object.values(value).every((v) => v === undefined || item(v));

/** An object with an id whose listed fields, when present, pass their checks. */
const shape =
  (fields: Record<string, Check>): Check =>
  (value) =>
    isObject(value) &&
    typeof value.id === 'string' &&
    Object.entries(fields).every(([key, check]) => value[key] === undefined || check(value[key]));

/** An object whose listed fields are all present and pass their checks. */
const exact =
  (fields: Record<string, Check>): Check =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([key, check]) => check(value[key]));

const isFormat = exact({ periodType: oneOf('quarters', 'halves'), segmentsPerPeriod: (v) => isCount(6)(v) && v !== 0 });
const isRules = exact({ positionCoverage: isBoolean, equalTime: isBoolean, limitBench: isBoolean, balanceSkill: isBoolean });
const isSlot = exact({ playerId: isString, positionId: (v) => v === null || isString(v) });
const isLineup = listOf(isSlot, MAX_LINEUP);
const isPlan = listOf(isLineup, MAX_SEGMENTS);
const isLock = exact({ segment: isCount(MAX_SEGMENTS), playerId: isString, kind: oneOf('in', 'out') });
const isStatus: Check = (value) =>
  exact({ kind: oneOf('out'), from: isCount() })(value) ||
  exact({ kind: oneOf('resting'), from: isCount(), until: isCount() })(value) ||
  exact({ kind: oneOf('arrived'), at: isCount() })(value);
const isEvent = exact({ kind: isString, segment: isCount() });
const isHandoff = exact({ n: isNumber, role: oneOf('coach', 'assistant'), away: isBoolean });

export const isValidTeam = shape({
  name: isString,
  positions: listOf(exact({ id: isString, name: isString, short: isString }), 10),
  requirement: recordOf(isCount(5)),
  defaultFormat: isFormat,
  defaultRules: isRules,
  archived: isBoolean,
});

export const isValidPlayer = shape({
  teamId: isString,
  name: isString,
  number: isString,
  skills: recordOf(oneOf(1, 2, 3)),
  active: isBoolean,
});

const gameFields = shape({
  teamId: isString,
  date: isString,
  opponent: isString,
  attending: listOf(isString),
  format: isFormat,
  rules: isRules,
  plan: isPlan,
  startPlan: isPlan,
  played: isPlan,
  warnings: listOf(isObject),
  seed: isNumber,
  status: oneOf('planned', 'live', 'final'),
  current: isCount(MAX_SEGMENTS),
  subbedOut: listOf(isSlot, MAX_LINEUP),
  statuses: recordOf(isStatus),
  events: listOf(isEvent),
  locks: listOf(isLock),
  handoff: isHandoff,
});

/** A game's fields are well formed, and a live game's current segment is in its plan. */
export const isValidGame: Check = (value) => {
  if (!gameFields(value)) return false;
  const game = value as { plan?: unknown[]; current?: number; status?: string };
  if (game.status === 'live' && game.plan && (game.current ?? 0) >= game.plan.length) return false;
  return true;
};
