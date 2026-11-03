import { useState } from 'react';
import { Empty, Jersey, Section, Segmented, Stepper, Toggle, TopBar } from '../components/ui';
import { deleteGame, toggleAttending, updateGame } from '../data/repo';
import { useGameData } from '../hooks/useGameData';
import type { Game, Player, Team } from '../data/types';
import { describeError, planGame, segmentCount } from '../domain/game';
import { navigate, paths } from '../router';
import { RULE_HELP } from './ruleHelp';

/** Game setup: date, opponent, attendance, format and rules (G1–G3). */
export function GameSetupScreen({ gameId }: { gameId: string }) {
  const data = useGameData(gameId);
  if (data.state === 'loading') return <main className="screen" />;
  if (data.state === 'missing') {
    return (
      <main className="screen">
        <TopBar title="Game" back={paths.teams()} />
        <Empty>This game no longer exists.</Empty>
      </main>
    );
  }
  const roster = [...data.roster].sort((a, b) => a.name.localeCompare(b.name));
  // Keyed by game id so local text state resets if a different game opens.
  return <Setup key={data.game.id} game={data.game} team={data.team} roster={roster} />;
}

function Setup({ game, team, roster }: { game: Game; team: Team; roster: Player[] }) {
  const [error, setError] = useState<string | null>(null);
  // Typed text is kept locally so fast typing never races the database.
  const [opponent, setOpponent] = useState(game.opponent);
  const update = (changes: Partial<Game>) => void updateGame(game.id, changes);
  const locked = game.status !== 'planned';
  const players = roster.filter((p) => p.active || game.attending.includes(p.id));

  const generate = async () => {
    const seed = game.plan.length > 0 ? game.seed + 1 : game.seed;
    const outcome = planGame({ ...game, plan: [] }, team, roster, seed);
    if (!outcome.ok) {
      setError(describeError(outcome.error, game, team.positions));
      return;
    }
    setError(null);
    await updateGame(game.id, { opponent, plan: outcome.plan, warnings: outcome.warnings, seed });
    navigate(paths.gamePlan(game.id));
  };

  return (
    <main className="screen with-footer">
      <TopBar title="Game setup" back={paths.team(team.id)} />

      <Section title="Game">
        <label className="field">
          <span>Opponent</span>
          <input
            value={opponent}
            placeholder="Optional"
            onChange={(e) => setOpponent(e.target.value)}
            onBlur={() => update({ opponent })}
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={game.date} onChange={(e) => update({ date: e.target.value })} />
        </label>
      </Section>

      <Section title={`Attending (${game.attending.length})`}>
        {players.length === 0 && <Empty>This team has no players yet. Add them on the team's Roster tab.</Empty>}
        <ul className="list">
          {players.map((p) => (
            <li key={p.id}>
              <label className="list-item check">
                <Jersey number={p.number} />
                <span className="list-title">{p.name}</span>
                <input
                  type="checkbox"
                  checked={game.attending.includes(p.id)}
                  disabled={locked}
                  onChange={() => void toggleAttending(game.id, p.id)}
                  aria-label={`${p.name} attending`}
                />
                <span className="checkmark" aria-hidden />
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Format">
        <div className="row">
          <span className="row-label">Periods</span>
          <Segmented
            label="Periods"
            value={game.format.periodType}
            onChange={(periodType) =>
              !locked &&
              update({
                format: { periodType, segmentsPerPeriod: periodType === 'quarters' ? 2 : 4 },
                plan: [],
                warnings: [],
              })
            }
            options={[
              { value: 'quarters', label: 'Quarters' },
              { value: 'halves', label: 'Halves' },
            ]}
          />
        </div>
        <div className="row">
          <span className="row-label">Subs per {game.format.periodType === 'quarters' ? 'quarter' : 'half'}</span>
          <Stepper
            label="segments per period"
            value={game.format.segmentsPerPeriod}
            min={1}
            max={6}
            onChange={(v) => !locked && update({ format: { ...game.format, segmentsPerPeriod: v }, plan: [], warnings: [] })}
          />
        </div>
        <p className="hint">{segmentCount(game.format)} lineups in this game.</p>
      </Section>

      <Section title="Rules for this game">
        {(Object.keys(RULE_HELP) as (keyof typeof RULE_HELP)[]).map((key) => (
          <Toggle
            key={key}
            label={RULE_HELP[key].label}
            info={RULE_HELP[key].help}
            checked={game.rules[key]}
            onChange={(v) => !locked && update({ rules: { ...game.rules, [key]: v }, plan: [], warnings: [] })}
          />
        ))}
      </Section>

      {!locked && (
        <Section title="">
          <button
            type="button"
            className="btn danger wide"
            onClick={() => {
              if (window.confirm('Delete this game?')) void deleteGame(game.id).then(() => navigate(paths.team(team.id)));
            }}
          >
            Delete game
          </button>
        </Section>
      )}

      <footer className="footer">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {locked ? (
          <a className="btn wide big" href={game.status === 'live' ? paths.gameLive(game.id) : paths.gamePlan(game.id)}>
            {game.status === 'live' ? 'Back to game' : 'View game'}
          </a>
        ) : game.plan.length > 0 ? (
          <a className="btn wide big" href={paths.gamePlan(game.id)}>
            View plan
          </a>
        ) : (
          <button type="button" className="btn wide big" onClick={() => void generate()}>
            Generate plan
          </button>
        )}
      </footer>
    </main>
  );
}
