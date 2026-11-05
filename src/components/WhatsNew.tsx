import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../data/db';
import { markVersionSeen, releaseToShow, type Release } from '../data/whatsNew';
import { formatGameDate } from '../domain/game';
import { useInLiveGame } from '../hooks/useInLiveGame';
import { useRoute } from '../router';
import { Sheet } from './ui';

const GROUPS = [
  ['new', 'New'],
  ['improved', 'Improved'],
  ['fixed', 'Fixed'],
] as const;

/** One release's changes, grouped New, Improved, Fixed (REL3). */
export function ReleaseNotes({ release }: { release: Release }) {
  return (
    <div className="release-notes">
      {GROUPS.map(([key, heading]) =>
        release[key]?.length ? (
          <div key={key}>
            <h3 className="sheet-sub">{heading}</h3>
            <ul className="release-list">
              {release[key]!.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * Shows what's new once, after the app updates to a new version (REL3).
 * Never during a game or the first-run intro.
 */
export function WhatsNewSheet() {
  const route = useRoute();
  const inGame = useInLiveGame();
  const teamCount = useLiveQuery(() => db.teams.count());
  const [closed, setClosed] = useState(false);
  if (closed || inGame || teamCount === undefined || route.name === 'welcome') return null;
  const release = releaseToShow(teamCount > 0);
  if (!release) return null;

  const close = () => {
    markVersionSeen(release.version);
    setClosed(true);
  };
  return (
    <Sheet title={`What’s new in ${release.version}`} onClose={close}>
      <p className="hint">next5 updated on {formatGameDate(release.date)}. Your teams and games are just as you left them.</p>
      <ReleaseNotes release={release} />
      <button type="button" className="btn wide" onClick={close}>
        Got it
      </button>
    </Sheet>
  );
}
