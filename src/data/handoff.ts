import { slug } from './backup';
import { upgradeGameV2, upgradeGameV3 } from './db';
import type { Game, Handoff, Player, Team } from './types';
import { isValidGame, isValidPlayer, isValidTeam } from './validate';

/**
 * Handing a game between the coach's and the assistant's phones (SH1–SH6).
 * The game travels as a link (Messages, WhatsApp, email) or a file (AirDrop,
 * Files). There's no server: in a link the game is packed after the #, which
 * browsers never send to the web server.
 */

export const HANDOFF_FORMAT = 'next5-game';
/** Version of the handoff layout (not the app). */
export const HANDOFF_VERSION = 1;

export type Role = Handoff['role'];

export interface GameHandoff {
  format: typeof HANDOFF_FORMAT;
  version: number;
  sentAt: string;
  /** The handoff number this send gives the game. */
  n: number;
  /** Who sent it. */
  from: Role;
  team: Team;
  /** The game's attending players, with skill levels for game-day re-plans (decision 2026-11-03). */
  players: Player[];
  /** The game without this phone's handoff state. */
  game: Game;
}

/** This phone's role for a game; a game nobody has handed over is the coach's. */
export const roleOf = (game: Game): Role => game.handoff?.role ?? 'coach';

/** The game as it would be sent now: the next handoff number, from this phone's role. */
export function makeHandoff(game: Game, team: Team, roster: Player[], now = new Date()): GameHandoff {
  const { handoff, ...rest } = game;
  const attending = new Set(game.attending);
  return {
    format: HANDOFF_FORMAT,
    version: HANDOFF_VERSION,
    sentAt: now.toISOString(),
    n: (handoff?.n ?? 0) + 1,
    from: roleOf(game),
    team,
    players: roster.filter((p) => attending.has(p.id)),
    game: rest,
  };
}

export type ParseHandoffResult = { ok: true; handoff: GameHandoff } | { ok: false; message: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const hasId = (value: unknown) => isObject(value) && typeof value.id === 'string';

/** Checks a received game before anything is changed. Older games are brought up to date like the database. */
export function parseHandoff(text: string): ParseHandoffResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "This isn't a next5 game (it can't be read)." };
  }
  if (isObject(data) && data.format === 'next5-backup') {
    return { ok: false, message: 'This is a backup file, not a game. Restore it from Settings.' };
  }
  if (!isObject(data) || data.format !== HANDOFF_FORMAT) return { ok: false, message: "This isn't a next5 game." };
  if (typeof data.version !== 'number' || data.version > HANDOFF_VERSION) {
    return { ok: false, message: 'This game was sent from a newer version of next5. Update the app, then try again.' };
  }
  const { team, players, game, n, from } = data;
  const valid =
    hasId(team) &&
    Array.isArray(players) &&
    players.every(hasId) &&
    hasId(game) &&
    isObject(game) &&
    (game as Partial<Game>).teamId === (team as Team).id &&
    typeof n === 'number' &&
    n >= 1 &&
    (from === 'coach' || from === 'assistant');
  if (!valid) return { ok: false, message: 'This game is damaged and can’t be opened. Ask for it to be sent again.' };
  const copy = structuredClone(game) as Partial<Game>;
  upgradeGameV2(copy);
  upgradeGameV3(copy);
  delete copy.handoff;
  if (!isValidTeam(team) || !(players as unknown[]).every(isValidPlayer) || !isValidGame(copy)) {
    return { ok: false, message: 'This game is damaged and can’t be opened. Ask for it to be sent again.' };
  }
  return {
    ok: true,
    handoff: {
      format: HANDOFF_FORMAT,
      version: data.version,
      sentAt: typeof data.sentAt === 'string' ? data.sentAt : '',
      n,
      from,
      team: team as Team,
      players: players as Player[],
      game: copy as Game,
    },
  };
}

// Links. The data is gzip-compressed JSON in base64url, prefixed "z"; where
// the browser can't compress (iOS before 16.4) it's plain JSON, prefixed "j".

const RECEIVE = '#/receive/';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Response(bytes as BufferSource).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Packs a handoff into the text that goes after #/receive/ in a link. */
export async function encodeHandoff(handoff: GameHandoff, compress = typeof CompressionStream === 'function'): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(handoff));
  if (!compress) return `j${toBase64Url(bytes)}`;
  return `z${toBase64Url(await pipe(bytes, new CompressionStream('gzip')))}`;
}

/** Unpacks the text after #/receive/ in a link. */
export async function decodeHandoff(data: string): Promise<ParseHandoffResult> {
  const damaged = { ok: false as const, message: 'This link is damaged or cut off. Ask for the game to be sent again.' };
  try {
    const bytes = fromBase64Url(data.slice(1));
    if (data.startsWith('j')) return parseHandoff(new TextDecoder().decode(bytes));
    if (data.startsWith('z')) {
      if (typeof DecompressionStream !== 'function') {
        return { ok: false, message: 'This phone’s iOS is too old to open game links. Update iOS, or ask for a file instead.' };
      }
      return parseHandoff(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip'))));
    }
    return damaged;
  } catch {
    return damaged;
  }
}

/** The full link, on whatever site this copy of the app runs from. */
export function handoffLink(data: string, base: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${base.origin}${base.pathname}${RECEIVE}${data}`;
}

/** Finds the game data in pasted text: a whole link, a message with a link in it, or the data alone. */
export function dataFromText(text: string): string | null {
  const at = text.indexOf(RECEIVE);
  const candidate = (at === -1 ? text.trim() : text.slice(at + RECEIVE.length)).match(/^[zj][A-Za-z0-9_-]+/);
  return candidate ? candidate[0] : null;
}

/** e.g. next5-8u-thunder-game-2026-11-08-vs-tigers.json, so files for several teams stay apart. */
export function handoffFileName(handoff: GameHandoff): string {
  const team = slug(handoff.team.name) || 'team';
  const opponent = slug(handoff.game.opponent);
  return `next5-${team}-game-${handoff.game.date}${opponent ? `-vs-${opponent}` : ''}.json`;
}

// Receiving

export type ReceiveDecision =
  /** This phone doesn't have the game yet. */
  | { kind: 'add' }
  /** The incoming copy is newer: use it. */
  | { kind: 'replace' }
  /** This phone already has this copy or a newer one. */
  | { kind: 'older' }
  /** This phone has played further than the incoming copy (SH4). Replacing needs a second tap. */
  | { kind: 'would-lose'; localPlayed: number; incomingPlayed: number }
  /** Both phones changed the game since the last handoff (after Take back control). Ask which to keep. */
  | { kind: 'tie' };

/**
 * What to do with a received game (SH4). Handoff numbers decide, never the
 * phones' clocks, which can disagree.
 */
export function decideReceive(local: Game | undefined, incoming: GameHandoff): ReceiveDecision {
  if (!local) return { kind: 'add' };
  const localN = local.handoff?.n ?? 0;
  const fromOther = incoming.from !== roleOf(local);
  // The same copy opened twice, or an older one, or this phone's own send.
  if (incoming.n < localN || (incoming.n === localN && (local.updatedAt === incoming.game.updatedAt || !fromOther))) {
    return { kind: 'older' };
  }
  if (local.played.length > incoming.game.played.length) {
    return { kind: 'would-lose', localPlayed: local.played.length, incomingPlayed: incoming.game.played.length };
  }
  // A game coming back to the phone that sent it, or a newer send.
  if (incoming.n > localN || (local.handoff?.away && fromOther)) return { kind: 'replace' };
  return { kind: 'tie' };
}

/** This phone's handoff state after keeping a received game. */
export function receivedHandoff(incoming: GameHandoff): Handoff {
  return { n: incoming.n, role: incoming.from === 'coach' ? 'assistant' : 'coach', away: false };
}
