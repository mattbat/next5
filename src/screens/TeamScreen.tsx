import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Empty, Info, Jersey, Section, Segmented, Stepper, Toggle, TopBar } from '../components/ui';
import { backUp } from '../data/backup';
import { db } from '../data/db';
import { SKILL_LEVELS } from '../data/defaults';
import { createGame, deleteTeam, updateTeam } from '../data/repo';
import type { Game, Player, Team } from '../data/types';
import { navigate, paths } from '../router';
import { PlayerSheet } from './PlayerSheet';
import { RULE_HELP } from './ruleHelp';

type Tab = 'roster' | 'games' | 'settings';

export function TeamScreen({ teamId }: { teamId: string }) {
  // null = not found; undefined = still loading.
  const team = useLiveQuery(async () => (await db.teams.get(teamId)) ?? null, [teamId]);
  const players = useLiveQuery(() => db.players.where('teamId').equals(teamId).sortBy('name'), [teamId]);
  const games = useLiveQuery(
    () => db.games.where('teamId').equals(teamId).reverse().sortBy('date'),
    [teamId],
  );
  const [tab, setTab] = useState<Tab>('games');

  if (team === undefined || players === undefined) return <main className="screen" />;
  if (team === null) {
    return (
      <main className="screen">
        <TopBar title="Team" back={paths.teams()} />
        <Empty>This team no longer exists.</Empty>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar title={team.name} back={paths.teams()} />
      <Segmented
        label="Team sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'games', label: 'Games' },
          { value: 'roster', label: `Roster (${players.filter((p) => p.active).length})` },
          { value: 'settings', label: 'Settings' },
        ]}
      />
      {tab === 'roster' && <Roster team={team} players={players} />}
      {tab === 'games' && <Games team={team} games={games ?? []} hasPlayers={players.length > 0} />}
      {tab === 'settings' && <TeamSettings team={team} />}
    </main>
  );
}

function Roster({ team, players }: { team: Team; players: Player[] }) {
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const positionName = (id: string) => team.positions.find((p) => p.id === id)?.short ?? id;
  const skillName = (level: number) => SKILL_LEVELS[level - 1]?.name ?? '';

  return (
    <Section
      title="Players"
      aside={
        <button type="button" className="btn small" onClick={() => setEditing('new')}>
          + Add
        </button>
      }
    >
      {players.length === 0 && <Empty>No players yet. Tap + Add to build your roster.</Empty>}
      <ul className="list">
        {players.map((p) => (
          <li key={p.id}>
            <button type="button" className={`list-item ${p.active ? '' : 'inactive'}`} onClick={() => setEditing(p)}>
              <Jersey number={p.number} />
              <span className="list-title">{p.name}</span>
              <span className="chips">
                {Object.entries(p.skills).map(([pos, level]) => (
                  <span key={pos} className="chip" title={skillName(level ?? 0)}>
                    {positionName(pos)}
                  </span>
                ))}
                {!p.active && <span className="chip muted">Inactive</span>}
              </span>
              <span className="chevron">›</span>
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <PlayerSheet team={team} player={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Section>
  );
}

const STATUS_LABEL = { planned: 'Planned', live: 'In progress', final: 'Final' } as const;

function Games({ team, games, hasPlayers }: { team: Team; games: Game[]; hasPlayers: boolean }) {
  const open = (game: Game) => {
    if (game.status === 'live') return paths.gameLive(game.id);
    if (game.plan.length > 0) return paths.gamePlan(game.id);
    return paths.gameSetup(game.id);
  };
  return (
    <Section
      title="Games"
      aside={
        <button
          type="button"
          className="btn small"
          onClick={() => void createGame(team).then((g) => navigate(paths.gameSetup(g.id)))}
        >
          + New game
        </button>
      }
    >
      {games.length === 0 && !hasPlayers && (
        <Empty>No players yet. Add your roster on the Roster tab, then come back here to plan a game.</Empty>
      )}
      {games.length === 0 && hasPlayers && <Empty>No games yet. Tap + New game to plan your next one.</Empty>}
      <ul className="list">
        {games.map((g) => (
          <li key={g.id}>
            <a className="list-item" href={open(g)}>
              <span className="list-title">
                {g.opponent ? `vs ${g.opponent}` : 'Game'}
                <span className="list-sub">{formatDate(g.date)}</span>
              </span>
              <span className={`status status-${g.status}`}>{STATUS_LABEL[g.status]}</span>
              <span className="chevron">›</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function TeamSettings({ team }: { team: Team }) {
  const [name, setName] = useState(team.name);
  const required = Object.values(team.requirement).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0;

  return (
    <>
      <Section title="Team">
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && void updateTeam(team.id, { name: name.trim() })}
          />
        </label>
      </Section>

      <Section title="Position requirement">
        <p className="hint">
          The minimum number of players who can play each position, in every lineup.
          <Info label="position requirement">
            For example, Guard 2 means every lineup includes at least two players marked as able to play Guard. One
            player only counts toward one position. Turn off "Cover positions" below to ignore positions.
          </Info>
        </p>
        {team.positions.map((pos) => (
          <div className="row" key={pos.id}>
            <span className="row-label">{pos.name}</span>
            <Stepper
              label={`${pos.name} required`}
              value={team.requirement[pos.id] ?? 0}
              min={0}
              max={Math.min(5, (team.requirement[pos.id] ?? 0) + 5 - required)}
              onChange={(v) => void updateTeam(team.id, { requirement: { ...team.requirement, [pos.id]: v } })}
            />
          </div>
        ))}
      </Section>

      <Section title="Default game format">
        <div className="row">
          <span className="row-label">Periods</span>
          <Segmented
            label="Periods"
            value={team.defaultFormat.periodType}
            onChange={(periodType) =>
              void updateTeam(team.id, {
                defaultFormat: { periodType, segmentsPerPeriod: periodType === 'quarters' ? 2 : 4 },
              })
            }
            options={[
              { value: 'quarters', label: 'Quarters' },
              { value: 'halves', label: 'Halves' },
            ]}
          />
        </div>
        <div className="row">
          <span className="row-label">
            Subs per {team.defaultFormat.periodType === 'quarters' ? 'quarter' : 'half'}
          </span>
          <Stepper
            label="segments per period"
            value={team.defaultFormat.segmentsPerPeriod}
            min={1}
            max={6}
            onChange={(v) => void updateTeam(team.id, { defaultFormat: { ...team.defaultFormat, segmentsPerPeriod: v } })}
          />
        </div>
      </Section>

      <Section title="Default rules">
        {(Object.keys(RULE_HELP) as (keyof typeof RULE_HELP)[]).map((key) => (
          <Toggle
            key={key}
            label={RULE_HELP[key].label}
            info={RULE_HELP[key].help}
            checked={team.defaultRules[key]}
            onChange={(v) => void updateTeam(team.id, { defaultRules: { ...team.defaultRules, [key]: v } })}
          />
        ))}
      </Section>

      <TeamBackup team={team} />

      <Section title="Danger zone">
        <button
          type="button"
          className="btn danger wide"
          onClick={() => {
            if (window.confirm(`Delete ${team.name} with all its players and games? This can't be undone.`)) {
              void deleteTeam(team.id).then(() => navigate(paths.teams()));
            }
          }}
        >
          Delete team
        </button>
      </Section>
    </>
  );
}

/** Backs up just this team (B1), e.g. to hand it to another coach. */
function TeamBackup({ team }: { team: Team }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Section title="Backup">
      <button type="button" className="btn secondary wide" onClick={() => void backUp(team.id, team.name).then(setMessage)}>
        Back up this team
      </button>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <p className="hint">
        Saves this team with its players and games. To back up every team, or to restore, use Settings on the Teams screen.
      </p>
    </Section>
  );
}
