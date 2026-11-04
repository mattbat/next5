import { useRef, useState } from 'react';
import { Info, Section, Segmented, TopBar } from '../components/ui';
import {
  backUp,
  lastBackupAt,
  parseBackup,
  restoreBackup,
  summarize,
  type Backup,
  type RestoreMode,
} from '../data/backup';
import { paths } from '../router';
import { setThemePreference, themePreference, type ThemePreference } from '../theme';

function formatWhen(time: number | null): string {
  if (time === null) return 'Never';
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Settings: appearance (D10), backup and restore (B1, B2), updates and app info (B4). */
export function SettingsScreen() {
  const [theme, setTheme] = useState(themePreference);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [last, setLast] = useState(lastBackupAt);
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
    if (mode === 'replace' && !window.confirm('Replace all teams and games on this phone with the backup? This can’t be undone.')) {
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

  const summary = pending ? summarize(pending) : null;

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
        <p className="hint">Last backup: {formatWhen(last)}</p>
        <button type="button" className="btn wide" onClick={() => void onBackUp()}>
          Back up all teams
        </button>
        <p className="hint">To back up one team, use the Settings tab on that team.</p>
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
              {plural(summary.players, 'player')} and {plural(summary.games, 'game')}.
            </p>
            <button type="button" className="btn wide" onClick={() => void onRestore('merge')}>
              Merge into this phone
            </button>
            <p className="hint">Adds anything missing. Where both have a copy, the more recently changed one is kept.</p>
            <button type="button" className="btn danger wide" onClick={() => void onRestore('replace')}>
              Replace everything
            </button>
            <p className="hint">Deletes all teams and games on this phone first.</p>
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
          next5 version {__APP_VERSION__} · <a href={paths.diagnostics()}>Diagnostics</a>
        </p>
      </Section>
    </main>
  );
}
