import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import type { Game, Player, Team } from '../data/types';

export type GameData =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; game: Game; team: Team; roster: Player[]; byId: Map<string, Player> };

/** Loads a game with its team and roster, kept live as they change. */
export function useGameData(gameId: string): GameData {
  const data = useLiveQuery(async () => {
    const game = await db.games.get(gameId);
    if (!game) return null;
    const [team, roster] = await Promise.all([
      db.teams.get(game.teamId),
      db.players.where('teamId').equals(game.teamId).toArray(),
    ]);
    if (!team) return null;
    return { game, team, roster };
  }, [gameId]);

  if (data === undefined) return { state: 'loading' };
  if (data === null) return { state: 'missing' };
  return { state: 'ready', ...data, byId: new Map(data.roster.map((p) => [p.id, p])) };
}
