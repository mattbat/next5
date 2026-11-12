import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Empty, Section, TopBar } from '../components/ui';
import { db } from '../data/db';
import { addStarterDrills } from '../data/repo';
import type { Drill } from '../data/types';
import { paths } from '../router';
import { useDrillFilter } from '../hooks/useDrillFilter';
import { DrillRow, DrillSheet } from './DrillSheet';

/** The drill library, shared by all teams (PR2, PR3). */
export function DrillsScreen() {
  const drills = useLiveQuery(() => db.drills.orderBy('name').toArray(), []);
  const [editing, setEditing] = useState<Drill | 'new' | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const list = (drills ?? []).filter((d) => showRetired || !d.retired);
  const { shown, controls } = useDrillFilter(list);
  const retired = (drills ?? []).filter((d) => d.retired).length;

  const addStarters = async () => {
    const added = await addStarterDrills();
    setMessage(added === 0 ? 'You already have every starter drill.' : `Added ${added} starter drill${added === 1 ? '' : 's'}. Edit or delete any of them.`);
  };

  if (drills === undefined) return <main className="screen" />;
  return (
    <main className="screen">
      <TopBar title="Drills" back={paths.teams()} historyBack />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <Section
        title={`Library (${drills.length - retired})`}
        aside={
          <button type="button" className="btn small" onClick={() => setEditing('new')}>
            + New drill
          </button>
        }
      >
        <p className="hint">Shared by all your teams. Tap a drill to edit it.</p>
        {drills.length > 0 && controls}
        {drills.length === 0 && <Empty>No drills yet. Add your own, or start from the starter drills below.</Empty>}
        <ul className="list">
          {shown.map((d) => (
            <li key={d.id}>
              <DrillRow drill={d} onClick={() => setEditing(d)} />
            </li>
          ))}
        </ul>
        {retired > 0 && (
          <button type="button" className="link" aria-expanded={showRetired} onClick={() => setShowRetired(!showRetired)}>
            {showRetired ? 'Hide retired drills' : `Show retired drills (${retired})`}
          </button>
        )}
      </Section>

      <Section title="Starter drills">
        <p className="hint">About 20 common drills for 9U and 12U teams, with coaching points. Keep, edit or delete any of them. Adding them again only adds ones you don’t have.</p>
        <button type="button" className="btn secondary wide" onClick={() => void addStarters()}>
          Add starter drills
        </button>
      </Section>

      {editing && <DrillSheet drill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}
