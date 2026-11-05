import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { useRoute } from '../router';

/**
 * True on any screen of a game in progress (Game Day, its plan, its setup),
 * where nothing should interrupt the coach (T8). Re-checks on every
 * navigation. While the game is still loading it counts as in progress.
 */
export function useInLiveGame(): boolean {
  const route = useRoute();
  const gameId = 'gameId' in route ? route.gameId : null;
  const status = useLiveQuery(async () => (gameId ? ((await db.games.get(gameId))?.status ?? null) : null), [gameId]);
  return gameId !== null && (status === undefined || status === 'live');
}
