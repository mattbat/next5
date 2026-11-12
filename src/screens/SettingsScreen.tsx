import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Info, Section, Segmented, TopBar } from '../components/ui';
import { BETA, versionLabel } from '../beta';
import { db } from '../data/db';
import { eraseEverything } from '../data/repo';
import {
  backUp,
  formatBackupDate,
  lastBackupAt,
  parseBackup,
  restoreBackup,
  summarize,
  type Backup,
  type RestoreMode,
} from '../data/backup';
import { paths } from '../router';
import { setThemePreference, themePreference, type ThemePreference } from '../theme';
import { HelpLink } from '../help/parts';
import { ReleaseNotes } from '../components/WhatsNew';
import { RELEASES } from '../data/whatsNew';
import { formatGameDate } from '../domain/game';

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Settings: appearance (D10), backup and restore (B1, B2), updates and app info (B4), and beta builds (REL5). */
export function SettingsScreen({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const [theme, setTheme] = useState(themePreference);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [last, setLast] = useState(lastBackupAt);
  const localTeams = useLiveQuery(() => db.teams.toArray());
  const [showAllReleases, setShowAllReleases] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const show = (text: string) => {
    setError(null);
    setMessage(text);
  };

  const onBackUp = async () => {
    show(await backUp());
    setLast(lastBackupAt());
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (fileInput.current) fileInput.current.value = '';
    if (!parsed.ok) {
      setMessage(null);
      setError(parsed.message);
      return;
    }
    setError(null);
    setMessage(null);
    setPending(parsed.backup);
  };

  const onRestore = async (mode: RestoreMode) => {
    if (!pending) return;
    const lost = lostTeams.length > 0 ? ` These teams aren’t in the backup and will be deleted: ${lostTeams.join(', ')}.` : '';
    if (mode === 'replace' && !window.confirm(`Replace all teams and games on this phone with the backup?${lost} This can’t be undone.`)) {
      return;
    }
    const result = await restoreBackup(pending, mode);
    setPending(null);
    show(
      mode === 'replace'
        ? 'Restored. Everything on this phone now matches the backup.'
        : `Merged: ${plural(result.added, 'item')} added, ${plural(result.updated, 'item')} updated from the backup, ${plural(result.kept, 'item')} kept as they were.`,
    );
  };

  // Beta only: start over, after offering a backup (REL5).
  const onErase = async () => {
    if ((localTeams?.length ?? 0) > 0 && window.confirm('Back up this beta copy first? Choose Cancel to skip the backup.')) {
      const before = lastBackupAt();
      const result = await backUp();
      setLast(lastBackupAt());
      if (lastBackupAt() === before) {
        show(`${result} Nothing was erased.`);
        return;
      }
    }
    if (!window.confirm('Erase every team, game and setting in this beta copy? The real next5 isn’t affected. This can’t be undone.')) {
      return;
    }
    await eraseEverything();
    reload();
  };

  const checkForUpdates = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
      show(
        registration?.waiting || registration?.installing
          ? 'A new version is downloading. You’ll see “Update available” when it’s ready.'
          : 'Checked for updates. If a new version is available you’ll see “Update available”.',
      );
    } catch {
      setMessage(null);
      setError('Couldn’t check for updates. Check your internet connection and try again.');
    }
  };

  // On a beta build, the changes waiting for the next release (REL5).
  const comingNext = BETA && Object.keys(BETA.next).length > 0 ? { version: 'next', date: '', ...BETA.next } : null;
  const summary = pending ? summarize(pending) : null;
  // Teams on this phone that "Replace everything" would delete (a one-team backup doesn't have the others).
  const inBackup = new Set(pending?.teams.map((t) => t.id));
  const lostTeams = (localTeams ?? []).filter((t) => !inBackup.has(t.id)).map((t) => t.name);

  return (
    <main className="screen">
      <TopBar title="Settings" back={paths.teams()} />

      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {BETA && (
        <Section title="Beta">
          <p className="hint">
            This is a test copy of next5, built from <b>{BETA.branch}</b>. Its teams and games are kept apart from the
            real app, so nothing you do here changes them. To try it with your real teams, back up in the real app and
            restore the file here.
          </p>
          <button type="button" className="btn danger wide" onClick={() => void onErase()}>
            Erase beta data
          </button>
        </Section>
      )}

      <Section title="Help">
        <a className="btn secondary wide" href={paths.help()}>
          Help and guide
        </a>
        <p className="hint">
          How every part of next5 works, with pictures. <a href={paths.welcome()}>Replay the intro</a>.
        </p>
      </Section>

      <Section
        title="Back up"
        aside={
          <Info label="backups">
            Your teams and games are saved only on this phone. If the app is deleted or Safari’s website data is cleared,
            they’re gone. A backup is a file you can save to Files, iCloud Drive or send by AirDrop, and restore later on
            any phone.
          </Info>
        }
      >
        <p className="hint">Last backup: {formatBackupDate(last)}</p>
        <button type="button" className="btn wide" onClick={() => void onBackUp()}>
          Back up all teams
        </button>
        <p className="hint">
          To back up one team, use the Settings tab on that team. <HelpLink topic="backup">About backups</HelpLink>
        </p>
      </Section>

      <Section title="Restore">
        {!summary && (
          <>
            <button type="button" className="btn secondary wide" onClick={() => fileInput.current?.click()}>
              Restore from a backup file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="file-input"
              aria-label="Backup file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </>
        )}
        {summary && (
          <div className="restore">
            <p>
              This backup has <b>{plural(summary.teamNames.length, 'team')}</b> ({summary.teamNames.join(', ') || 'none'}),{' '}
              {plural(summary.players, 'player')} and {plural(summary.games, 'game')}
              {summary.practices + summary.drills > 0 &&
                `, with ${plural(summary.practices, 'practice')} and ${plural(summary.drills, 'drill')}`}
              .
            </p>
            <button type="button" className="btn wide" onClick={() => void onRestore('merge')}>
              Merge into this phone
            </button>
            <p className="hint">Adds anything missing. Where both have a copy, the more recently changed one is kept.</p>
            <button type="button" className="btn danger wide" onClick={() => void onRestore('replace')}>
              Replace everything
            </button>
            <p className="hint">
              Deletes all teams and games on this phone first.
              {lostTeams.length > 0 && (
                <b>
                  {' '}
                  Not in this backup, so they’d be lost: {lostTeams.join(', ')}.
                </b>
              )}
            </p>
            <button type="button" className="link" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
      </Section>

      <Section title="Appearance">
        <Segmented<ThemePreference>
          label="Appearance"
          value={theme}
          onChange={(value) => {
            setThemePreference(value);
            setTheme(value);
          }}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'auto', label: 'Match phone' },
          ]}
        />
        <p className="hint">
          Dark is easiest to read in most gyms. Light can be clearer outdoors or in a bright room. On the Home Screen
          app, the clock and battery at the top update the next time you open next5.
        </p>
      </Section>

      <Section title="App">
        <button type="button" className="btn secondary wide" onClick={() => void checkForUpdates()}>
          Check for updates
        </button>
        <p className="hint">
          next5 version {versionLabel()} · <a href={paths.diagnostics()}>Diagnostics</a>
        </p>
      </Section>

      {(RELEASES.length > 0 || comingNext) && (
        <Section title="What’s new">
          {comingNext && (
            <div className="release">
              <p className="release-head">
                <b>Coming next</b> · not released yet
              </p>
              <ReleaseNotes release={comingNext} />
            </div>
          )}
          {RELEASES.slice(0, showAllReleases ? undefined : 1).map((release) => (
            <div key={release.version} className="release">
              <p className="release-head">
                <b>{release.version}</b> · {formatGameDate(release.date)}
              </p>
              <ReleaseNotes release={release} />
            </div>
          ))}
          {RELEASES.length > 1 && (
            <button
              type="button"
              className="link"
              aria-expanded={showAllReleases}
              onClick={() => setShowAllReleases(!showAllReleases)}
            >
              {showAllReleases ? 'Show only the latest' : `Show earlier versions (${RELEASES.length - 1})`}
            </button>
          )}
        </Section>
      )}
    </main>
  );
}
