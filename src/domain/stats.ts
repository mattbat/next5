import type { Lineup, PlayerId, PositionId } from '../engine';
import type { Game, Player, Position } from '../data/types';
import { availableAt } from './changes';

/**
 * Game and season stats (REQUIREMENTS.md S3–S5), counted in segments (S6).
 * Pure: takes games and players, returns numbers and CSV text. Skill levels
 * are never part of stats (P6).
 */

export interface PlayerGameStats {
  playerId: PlayerId;
  /** Segments in the plan as it stood at the start of the game. */
  planned: number;
  /** Segments on the court, including part of a segment (D4). */
  played: number;
  /** Segments the player could have played but sat. */
  sat: number;
  /** Segments played at each position. */
  byPosition: Partial<Record<PositionId, number>>;
}

const includes = (lineup: Lineup, playerId: PlayerId) => lineup.some((s) => s.playerId === playerId);

/**
 * Per-game stats for every player who was at the game (S3). Planned counts
 * only the segments that were played, so a game ended early (D9) compares
 * like with like.
 */
export function gameStats(game: Game): PlayerGameStats[] {
  const planned = (game.startPlan ?? game.plan).slice(0, game.played.length);
  return game.attending.map((playerId) => {
    const byPosition: Partial<Record<PositionId, number>> = {};
    let played = 0;
    let sat = 0;
    game.played.forEach((lineup, segment) => {
      const slot = lineup.find((s) => s.playerId === playerId);
      if (slot) {
        played += 1;
        if (slot.positionId !== null) byPosition[slot.positionId] = (byPosition[slot.positionId] ?? 0) + 1;
      } else if (availableAt(game.statuses[playerId], segment)) {
        sat += 1;
      }
    });
    return { playerId, planned: planned.filter((l) => includes(l, playerId)).length, played, sat, byPosition };
  });
}

export interface PlayerSeasonStats {
  playerId: PlayerId;
  /** Finished games the player was at. */
  games: number;
  played: number;
  /** Segments the player was available for (played + sat). */
  available: number;
  /** played ÷ available, 0–100, or null when they weren't available for any. */
  percent: number | null;
  byPosition: Partial<Record<PositionId, number>>;
}

/**
 * Season stats over a team's finished games (S4): one row per active player,
 * plus inactive players who played in any of them.
 */
export function seasonStats(games: Game[], players: Player[]): PlayerSeasonStats[] {
  const finished = games.filter((g) => g.status === 'final');
  const totals = new Map<PlayerId, PlayerSeasonStats>();
  const row = (playerId: PlayerId) => {
    let entry = totals.get(playerId);
    if (!entry) {
      entry = { playerId, games: 0, played: 0, available: 0, percent: null, byPosition: {} };
      totals.set(playerId, entry);
    }
    return entry;
  };
  for (const p of players) if (p.active) row(p.id);
  for (const game of finished) {
    for (const stats of gameStats(game)) {
      const entry = row(stats.playerId);
      entry.games += 1;
      entry.played += stats.played;
      entry.available += stats.played + stats.sat;
      for (const [positionId, count] of Object.entries(stats.byPosition)) {
        entry.byPosition[positionId] = (entry.byPosition[positionId] ?? 0) + (count ?? 0);
      }
    }
  }
  const known = new Set(players.map((p) => p.id));
  const name = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? '';
  return [...totals.values()]
    .filter((s) => known.has(s.playerId))
    .map((s) => ({ ...s, percent: s.available === 0 ? null : Math.round((s.played / s.available) * 100) }))
    .sort((a, b) => name(a.playerId).localeCompare(name(b.playerId)));
}

/** One CSV field, quoted when it needs to be (RFC 4180). */
function field(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number | null)[][]): string {
  // CRLF line endings and a byte-order mark so Excel reads names with accents correctly.
  return '\uFEFF' + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}

const playerCells = (players: Player[], id: PlayerId) => {
  const player = players.find((p) => p.id === id);
  return [player?.name ?? 'Unknown', player?.number ?? ''];
};

/** Per-game stats as CSV (S5). */
export function gameStatsCsv(game: Game, players: Player[], positions: Position[]): string {
  const name = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? '';
  const rows = gameStats(game).sort((a, b) => name(a.playerId).localeCompare(name(b.playerId)));
  return toCsv([
    ['Player', 'Number', 'Planned segments', 'Segments played', 'Segments sat', ...positions.map((p) => p.name)],
    ...rows.map((s) => [
      ...playerCells(players, s.playerId),
      s.planned,
      s.played,
      s.sat,
      ...positions.map((p) => s.byPosition[p.id] ?? 0),
    ]),
  ]);
}

/** Season stats as CSV (S5). */
export function seasonStatsCsv(games: Game[], players: Player[], positions: Position[]): string {
  return toCsv([
    ['Player', 'Number', 'Games', 'Segments played', 'Segments available', '% played', ...positions.map((p) => p.name)],
    ...seasonStats(games, players).map((s) => [
      ...playerCells(players, s.playerId),
      s.games,
      s.played,
      s.available,
      s.percent,
      ...positions.map((p) => s.byPosition[p.id] ?? 0),
    ]),
  ]);
}
