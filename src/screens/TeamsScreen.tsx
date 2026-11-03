import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Empty, Section, TopBar } from '../components/ui';
import { InstallHint } from '../components/InstallHint';
import { db } from '../data/db';
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

  const add = async () => {
    if (!name.trim()) return;
    const team = await createTeam(name);
    setName('');
    navigate(paths.team(team.id));
  };

  return (
    <main className="screen with-footer">
      <TopBar title={<span className="brand">next<span>5</span></span>} />
      <InstallHint />
      <Section title="Teams">
        {teams && teams.length === 0 && (
          <Empty>
            No teams yet. Add your team at the bottom of the screen, or load a demo team with made-up players to try things out.
          </Empty>
        )}
        <ul className="list">
          {teams?.map((team) => (
            <li key={team.id}>
              <a className="list-item" href={paths.team(team.id)}>
                <span className="list-title">{team.name}</span>
                <span className="list-meta">{counts?.get(team.id) ?? 0} players</span>
                <span className="chevron">›</span>
              </a>
            </li>
          ))}
        </ul>
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
            Add team
          </button>
        </form>
      </footer>
    </main>
  );
}
