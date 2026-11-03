import { useState } from 'react';
import { Empty, Info, Section, TopBar } from '../components/ui';
import { saveGame, updateGame } from '../data/repo';
import type { Game, Player, Team } from '../data/types';
import { describeError, describeWarning, planGame, segmentLabel, startGame } from '../domain/game';
import { useGameData } from '../hooks/useGameData';
import { navigate, paths } from '../router';

/** Plan review: who plays when, at what position, with totals and warnings (G4, G5, G8). */
export function PlanScreen({ gameId }: { gameId: string }) {
  const data = useGameData(gameId);
  if (data.state === 'loading') return <main className="screen" />;
  if (data.state === 'missing') {
    return (
      <main className="screen">
        <TopBar title="Plan" back={paths.teams()} />
        <Empty>This game no longer exists.</Empty>
      </main>
    );
  }
  return <Plan game={data.game} team={data.team} roster={data.roster} byId={data.byId} />;
}

function Plan({ game, team, roster, byId }: { game: Game; team: Team; roster: Player[]; byId: Map<string, Player> }) {
  const [error, setError] = useState<string | null>(null);
  const names = new Map(roster.map((p) => [p.id, p.name]));
  const short = (positionId: string | null) =>
    positionId === null ? '•' : (team.positions.find((p) => p.id === positionId)?.short ?? positionId);

  const players = game.attending
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const totals = new Map(players.map((p) => [p.id, game.plan.filter((l) => l.some((s) => s.playerId === p.id)).length]));

  const regenerate = async () => {
    const seed = game.seed + 1;
    const outcome = planGame({ ...game, plan: [] }, team, roster, seed);
    if (!outcome.ok) {
      setError(describeError(outcome.error, game, team.positions));
      return;
    }
    setError(null);
    await updateGame(game.id, { plan: outcome.plan, warnings: outcome.warnings, seed });
  };

  const start = async () => {
    await saveGame(startGame(game));
    navigate(paths.gameLive(game.id));
  };

  const title = game.opponent ? `vs ${game.opponent}` : 'Game plan';
  const isPlanned = game.status === 'planned';

  return (
    <main className="screen with-footer">
      <TopBar
        title={title}
        back={paths.team(team.id)}
        action={
          isPlanned ? (
            <a className="link" href={paths.gameSetup(game.id)}>
              Setup
            </a>
          ) : undefined
        }
      />

      {game.plan.length === 0 && <Empty>No plan yet. Go to Setup and tap Generate plan.</Empty>}

      {game.warnings.length > 0 && (
        <Section title="Heads up">
          <ul className="warnings">
            {game.warnings.map((w, i) => (
              <li key={i}>{describeWarning(w, game, names)}</li>
            ))}
          </ul>
        </Section>
      )}

      {game.plan.length > 0 && (
        <Section
          title="Rotation"
          aside={
            <Info label="the rotation grid">
              Each column is one segment between substitutions. A letter shows the position a player covers in that
              segment; an empty cell means they're on the bench. The last column is their total.
            </Info>
          }
        >
          <div className="grid-scroll">
            <table className="plan-grid">
              <thead>
                <tr>
                  <th className="name-col">Player</th>
                  {game.plan.map((_, i) => {
                    const label = segmentLabel(game.format, i);
                    return (
                      <th
                        key={i}
                        className={`${label.part === 1 ? 'period-start' : ''} ${i < game.played.length ? 'done' : ''}`}
                      >
                        <span className="th-period">{label.part === 1 ? label.period : ''}</span>
                        <span className="th-part">{label.of > 1 ? label.part : ''}</span>
                      </th>
                    );
                  })}
                  <th className="total-col">#</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <th className="name-col">{p.name}</th>
                    {game.plan.map((lineup, i) => {
                      const slot = lineup.find((s) => s.playerId === p.id);
                      const label = segmentLabel(game.format, i);
                      return (
                        <td
                          key={i}
                          className={`${slot ? 'on' : 'off'} ${label.part === 1 ? 'period-start' : ''} ${i < game.played.length ? 'done' : ''}`}
                          aria-label={slot ? `${label.text}: ${short(slot.positionId)}` : `${label.text}: bench`}
                        >
                          {slot ? short(slot.positionId) : ''}
                        </td>
                      );
                    })}
                    <td className="total-col">{totals.get(p.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <footer className="footer">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {isPlanned && game.plan.length > 0 && (
          <div className="footer-row">
            <button type="button" className="btn secondary" onClick={() => void regenerate()}>
              ↻ Shuffle
            </button>
            <button type="button" className="btn big grow" onClick={() => void start()}>
              Start game
            </button>
          </div>
        )}
        {game.status === 'live' && (
          <a className="btn wide big" href={paths.gameLive(game.id)}>
            Back to game
          </a>
        )}
      </footer>
    </main>
  );
}
