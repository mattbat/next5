import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import type { Drill, Player, Practice, Team } from '../data/types';
import { indexDrills, type DrillIndex } from '../domain/practice';

export type PracticeData =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; practice: Practice; team: Team; roster: Player[]; drills: Drill[]; drillIndex: DrillIndex };

/** Loads a practice with its team, roster and the drill library, kept live as they change. */
export function usePracticeData(practiceId: string): PracticeData {
  const data = useLiveQuery(async () => {
    const practice = await db.practices.get(practiceId);
    if (!practice) return null;
    const [team, roster, drills] = await Promise.all([
      db.teams.get(practice.teamId),
      db.players.where('teamId').equals(practice.teamId).sortBy('name'),
      db.drills.orderBy('name').toArray(),
    ]);
    if (!team) return null;
    return { practice, team, roster, drills };
  }, [practiceId]);

  if (data === undefined) return { state: 'loading' };
  if (data === null) return { state: 'missing' };
  return { state: 'ready', ...data, drillIndex: indexDrills(data.drills) };
}
