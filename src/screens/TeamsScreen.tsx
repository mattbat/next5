import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Empty, Section, TopBar } from '../components/ui';
import { InstallHint } from '../components/InstallHint';
import { db } from '../data/db';
import { backUp, backupReminderDue, lastBackupAt, snoozeReminder } from '../data/backup';
import { dataFromText, encodeHandoff, parseHandoff } from '../data/handoff';
import { createDemoTeam, createTeam } from '../data/repo';
import { navigate, paths } from '../router';

export function TeamsScreen() {
  const teams = useLiveQuery(() => db.teams.orderBy('name').toArray());
  const counts = useLiveQuery(async () => {
    const players = await db.players.toArray();
    const map = new Map<string, number>();
    for (const p of players) if (p.active) map.set(p.teamId, (map.get(p.teamId) ?? 0) + 1);
    return map;
  });
  const [name, setName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  // Archived teams (M1) leave the main list but keep everything.
  const active = teams?.filter((t) => !t.archived);
  const archived = teams?.filter((t) => t.archived) ?? [];
  const [reminderHidden, setReminderHidden] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const showReminder = !reminderHidden && backupReminderDue((teams?.length ?? 0) > 0);

  const runBackup = async () => {
    setBackupMessage(await backUp());
    setReminderHidden(true);
  };

  // Receiving a game from the coach or assistant (SH3).
  const pasteGame = async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return setReceiveError('Couldn’t read what you copied. Copy the game link again, then tap Paste game.');
    }
    const data = dataFromText(text);
    if (!data) return setReceiveError('What you copied isn’t a next5 game link. Copy the link from the message, then try again.');
    setReceiveError(null);
    navigate(paths.receive(data));
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseHandoff(await file.text());
    if (fileInput.current) fileInput.current.value = '';
    if (!parsed.ok) return setReceiveError(parsed.message);
    setReceiveError(null);
    navigate(paths.receive(await encodeHandoff(parsed.handoff)));
  };

  const add = async () => {
    if (!name.trim()) return;
    const team = await createTeam(name);
    setName('');
    navigate(paths.team(team.id));
  };

  return (
    <main className="screen with-footer">
      <TopBar
        title={<span className="brand">next<span>5</span></span>}
        action={
          <a className="link" href={paths.settings()}>
            Settings
          </a>
        }
      />
      <InstallHint />
      {showReminder && (
        <aside className="callout" aria-label="Back up your teams">
          <strong>Back up your teams</strong>
          <p>
            {lastBackupAt() === null
              ? 'Your teams and games are saved only on this phone.'
              : 'It’s been over a month since your last backup.'}{' '}
            A backup file keeps them safe if the app is deleted.
          </p>
          <div className="footer-row">
            <button type="button" className="btn small" onClick={() => void runBackup()}>
              Back up now
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                snoozeReminder();
                setReminderHidden(true);
              }}
            >
              Later
            </button>
          </div>
        </aside>
      )}
      {backupMessage && (
        <p className="notice" role="status">
          {backupMessage}
        </p>
      )}
      <Section title="Teams">
        {teams && teams.length === 0 && (
          <Empty>
            No teams yet. Add your team at the bottom of the screen, or load a demo team with made-up players to try things out.
          </Empty>
        )}
        {active && active.length === 0 && archived.length > 0 && (
          <Empty>All your teams are archived. Add a new team at the bottom of the screen.</Empty>
        )}
        <ul className="list">
          {active?.map((team) => (
            <li key={team.id}>
              <a className="list-item" href={paths.team(team.id)}>
                <span className="list-title">{team.name}</span>
                <span className="list-meta">{counts?.get(team.id) ?? 0} players</span>
                <span className="chevron">›</span>
              </a>
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <button
            type="button"
            className="link archived-toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? 'Hide' : 'Show'} archived teams ({archived.length})
          </button>
        )}
        {showArchived && (
          <ul className="list" aria-label="Archived teams">
            {archived.map((team) => (
              <li key={team.id}>
                <a className="list-item inactive" href={paths.team(team.id)}>
                  <span className="list-title">{team.name}</span>
                  <span className="chip muted">Archived</span>
                  <span className="chevron">›</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {teams && teams.length === 0 && (
          <button
            type="button"
            className="btn secondary wide"
            onClick={() => void createDemoTeam().then((t) => navigate(paths.team(t.id)))}
          >
            Load demo team
          </button>
        )}
      </Section>
      <Section title="Receive a shared game">
        <div className="footer-row">
          <button type="button" className="btn secondary grow" onClick={() => void pasteGame()}>
            Paste game
          </button>
          <button type="button" className="btn secondary grow" onClick={() => fileInput.current?.click()}>
            Open game file
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="file-input"
          aria-label="Game file"
          onChange={(e) => void openFile(e.target.files?.[0])}
        />
        {receiveError && (
          <p className="error" role="alert">
            {receiveError}
          </p>
        )}
      </Section>
      <p className="footnote">
        Everything is saved on this phone.{' '}
        <a className="footnote-link" href={paths.diagnostics()}>
          Version {__APP_VERSION__}
        </a>
        .
      </p>
      {/* Adding a team sits at the bottom of the screen, apart from the list. */}
      <footer className="footer add-team">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            aria-label="New team name"
            placeholder="New team name, e.g. 8U Thunder"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Add
          </button>
        </form>
      </footer>
    </main>
  );
}
