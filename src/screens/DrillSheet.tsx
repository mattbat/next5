import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Segmented, Sheet, Stepper } from '../components/ui';
import { db } from '../data/db';
import { createDrill, deleteDrill, updateDrill, type DrillFields } from '../data/repo';
import type { Court, Drill } from '../data/types';
import { formatGameDate } from '../domain/game';
import { drillNotes } from '../domain/practice';
import { allTags, useDrillFilter } from '../hooks/useDrillFilter';

/** Splits a text box into items, one per line or comma. */
const items = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Add or edit a drill (PR2). Done saves, like the player editor. */
export function DrillSheet({ drill, onClose, onCreated }: { drill: Drill | null; onClose: () => void; onCreated?: (d: Drill) => void }) {
  const library = useLiveQuery(() => db.drills.toArray(), []) ?? [];
  const practices = useLiveQuery(() => db.practices.toArray(), []) ?? [];
  const [name, setName] = useState(drill?.name ?? '');
  const [minutes, setMinutes] = useState(drill?.minutes ?? 10);
  const [court, setCourt] = useState<Court>(drill?.court ?? 'half');
  const [tags, setTags] = useState<string[]>(drill?.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [equipment, setEquipment] = useState((drill?.equipment ?? []).join('\n'));
  const [notes, setNotes] = useState(drill?.notes ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const history = drill ? drillNotes(drill.id, practices) : [];

  const fields = (): DrillFields => ({ name: name.trim(), minutes, court, tags, equipment: items(equipment), notes: notes.trim() });

  const save = async () => {
    if (!name.trim()) return onClose();
    if (drill) await updateDrill(drill.id, fields());
    else {
      // Not onCreated?.(await createDrill()): with no callback that would skip creating it.
      const created = await createDrill(fields());
      onCreated?.(created);
    }
    onClose();
  };

  const toggleTag = (tag: string) => setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setTags([...tags, tag]);
    setNewTag('');
  };

  const remove = async () => {
    if (!drill || !window.confirm(`Delete ${drill.name}?`)) return;
    if (await deleteDrill(drill.id)) onClose();
    else setMessage('This drill is in a practice, so it can’t be deleted. Retire it instead: it leaves the drill list but stays in your stats.');
  };

  return (
    <Sheet title={drill ? 'Edit drill' : 'New drill'} onClose={() => void save()}>
      <label className="field">
        <span>Name</span>
        <input autoFocus={!drill} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Closeouts" />
      </label>
      <div className="row">
        <span className="row-label">Minutes</span>
        <Stepper label="minutes" value={minutes} min={1} max={90} onChange={setMinutes} />
      </div>
      <div className="row">
        <span className="row-label">Court</span>
        <Segmented
          label="Court"
          value={court}
          onChange={setCourt}
          options={[
            { value: 'half', label: 'Half' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </div>

      <h3 className="sheet-sub">Tags</h3>
      <div className="tag-picker" role="group" aria-label="Tags">
        {allTags(library).map((tag) => (
          <button key={tag} type="button" className={`tag ${tags.includes(tag) ? 'on' : ''}`} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>
            {tag}
          </button>
        ))}
        {tags
          .filter((t) => !allTags(library).includes(t))
          .map((tag) => (
            <button key={tag} type="button" className="tag on" aria-pressed onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
      </div>
      <div className="inline-form">
        <input
          value={newTag}
          aria-label="New tag"
          placeholder="Another tag"
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag()}
        />
        <button type="button" className="btn small secondary" onClick={addTag} disabled={!newTag.trim()}>
          Add
        </button>
      </div>

      <label className="field top-gap">
        <span>Equipment (one per line, optional)</span>
        <textarea rows={3} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Cones" />
      </label>
      <label className="field">
        <span>Coaching points (optional)</span>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {history.length > 0 && (
        <>
          <h3 className="sheet-sub">How it went</h3>
          <ul className="drill-history">
            {history.map((h, i) => (
              <li key={`${h.practiceId}-${i}`}>
                <b>{formatGameDate(h.date)}</b> {h.rating === 'up' ? '👍' : h.rating === 'down' ? '👎' : ''} {h.note}
              </li>
            ))}
          </ul>
        </>
      )}

      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {drill && (
        <div className="footer-row top-gap">
          <button type="button" className="btn secondary wide" onClick={() => void updateDrill(drill.id, { retired: !drill.retired }).then(onClose)}>
            {drill.retired ? 'Bring back' : 'Retire'}
          </button>
          <button type="button" className="btn danger wide" onClick={() => void remove()}>
            Delete
          </button>
        </div>
      )}
      <button type="button" className="btn wide top-gap" onClick={() => void save()} disabled={!name.trim()}>
        {drill ? 'Save' : 'Add drill'}
      </button>
    </Sheet>
  );
}

/** One drill as a list row: name, length, court and tags. */
export function DrillRow({ drill, onClick, action }: { drill: Drill; onClick: () => void; action?: string }) {
  return (
    <button type="button" className={`list-item ${drill.retired ? 'inactive' : ''}`} onClick={onClick} aria-label={action ? `${action} ${drill.name}` : undefined}>
      <span className="list-title">
        {drill.name}
        <span className="list-sub">
          {drill.minutes} min · {drill.court === 'full' ? 'Full court' : 'Half court'}
          {drill.tags.length > 0 && ` · ${drill.tags.join(', ')}`}
        </span>
      </span>
      {drill.retired && <span className="chip muted">Retired</span>}
      <span className="chevron">{action ? '+' : '›'}</span>
    </button>
  );
}

/** Picks a drill from the library for a practice (PR4), or makes a new one. */
export function DrillPicker({ drills, title, onPick, onClose }: { drills: Drill[]; title: string; onPick: (d: Drill) => void; onClose: () => void }) {
  const active = drills.filter((d) => !d.retired);
  const { shown, controls } = useDrillFilter(active);
  const [creating, setCreating] = useState(false);
  if (creating) return <DrillSheet drill={null} onClose={() => setCreating(false)} onCreated={onPick} />;
  return (
    <Sheet title={title} onClose={onClose}>
      {controls}
      {active.length === 0 && <p className="hint">Your drill library is empty. Add a drill, or add the starter drills from the Drills screen.</p>}
      <ul className="list">
        {shown.map((d) => (
          <li key={d.id}>
            <DrillRow drill={d} action="Add" onClick={() => onPick(d)} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn secondary wide top-gap" onClick={() => setCreating(true)}>
        + New drill
      </button>
    </Sheet>
  );
}
