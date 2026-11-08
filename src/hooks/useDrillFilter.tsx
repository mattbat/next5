import { useState } from 'react';
import { SUGGESTED_TAGS } from '../data/starterDrills';
import type { Drill } from '../data/types';

/** Every tag in use or suggested, suggestions first (PR2). */
export function allTags(drills: Drill[]): string[] {
  const tags = [...SUGGESTED_TAGS];
  for (const d of drills) for (const t of d.tags) if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
  return tags;
}

/** Search and tag filter over drills, shared by the library and the picker (PR2). */
export function useDrillFilter(drills: Drill[]) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = drills.filter(
    (d) =>
      (!tag || d.tags.includes(tag)) &&
      (!q || d.name.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)) || d.notes.toLowerCase().includes(q)),
  );
  const tagsInUse = [...new Set(drills.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b));
  const controls = (
    <div className="drill-filter">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search drills" aria-label="Search drills" />
      {tagsInUse.length > 0 && (
        <div className="tag-picker scroll" role="group" aria-label="Filter by tag">
          {tagsInUse.map((t) => (
            <button key={t} type="button" className={`tag ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return { shown, controls };
}

