import type { Game, Player, Team } from '../data/types';
import { formatGameDate, segmentLabel, sortLineup } from './game';

/**
 * The whole plan as plain text (E2), for a message, Notes or printing: a
 * paper fallback, or for an assistant or parent without the app. One line
 * per segment, then each player's total. Skill levels are never included
 * (P6).
 *
 *   Q1 · 1 of 2: #3 Avery G, #23 Jordan G, #10 Casey C, #12 Devon F, #30 Kai F
 */
export function planText(game: Game, team: Team, roster: Player[]): string {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const short = (id: string | null) => (id === null ? '' : ` ${team.positions.find((p) => p.id === id)?.short ?? id}`);
  const who = (id: string) => {
    const player = byId.get(id);
    return `${player?.number ? `#${player.number} ` : ''}${player?.name ?? 'Unknown'}`;
  };

  const heading = [`${team.name}: ${game.opponent ? `vs ${game.opponent}` : 'game'}`, formatGameDate(game.date)];
  const lines = game.plan.map((lineup, i) => {
    const players = sortLineup(lineup, team.positions, byId).map((s) => `${who(s.playerId)}${short(s.positionId)}`);
    const played = i < game.played.length ? ' (played)' : '';
    return `${segmentLabel(game.format, i).text}${played}: ${players.join(', ')}`;
  });

  const totals = game.attending
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `${p.name} ${game.plan.filter((l) => l.some((s) => s.playerId === p.id)).length}`);

  return [heading.join(' · '), '', ...lines, '', `Segments each: ${totals.join(', ')}`, ''].join('\n');
}
