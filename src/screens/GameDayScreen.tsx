import { Empty, Jersey, Section, TopBar } from '../components/ui';
import { saveGame } from '../data/repo';
import type { Game, Player, Team } from '../data/types';
import { nextSegment, playingTime, segmentLabel, undoSegment } from '../domain/game';
import { substitutions, type Lineup } from '../engine';
import { useGameData } from '../hooks/useGameData';
import { useWakeLock } from '../hooks/useWakeLock';
import { paths } from '../router';

/** Game day: who's on, who comes in and out next, and one big Next button (§9). */
export function GameDayScreen({ gameId }: { gameId: string }) {
  const data = useGameData(gameId);
  useWakeLock(data.state === 'ready' && data.game.status === 'live');
  if (data.state === 'loading') return <main className="screen" />;
  if (data.state === 'missing') {
    return (
      <main className="screen">
        <TopBar title="Game" back={paths.teams()} />
        <Empty>This game no longer exists.</Empty>
      </main>
    );
  }
  const { game, team, byId } = data;
  if (game.status === 'final') return <Summary game={game} team={team} byId={byId} />;
  if (game.status === 'planned' || game.plan.length === 0) {
    return (
      <main className="screen">
        <TopBar title="Game" back={paths.team(team.id)} />
        <Empty>
          This game hasn't started. <a href={paths.gamePlan(game.id)}>Open the plan</a> and tap Start game.
        </Empty>
      </main>
    );
  }
  return <Live game={game} team={team} byId={byId} />;
}

function Live({ game, team, byId }: { game: Game; team: Team; byId: Map<string, Player> }) {
  const current = game.plan[game.current]!;
  const next: Lineup | undefined = game.plan[game.current + 1];
  const label = segmentLabel(game.format, game.current);
  const nextLabel = next ? segmentLabel(game.format, game.current + 1) : null;
  const change = next ? substitutions(current, next) : null;

  const position = (id: string | null) => (id === null ? '' : (team.positions.find((p) => p.id === id)?.name ?? id));
  const player = (id: string) => byId.get(id);
  const name = (id: string) => player(id)?.name ?? 'Unknown';

  // One row per spot on the court: who's on now, and who takes the spot next.
  const rows = current.map((slot) => {
    const sub = change?.subs.find((s) => s.out === slot.playerId);
    const stay = change?.stays.find((s) => s.playerId === slot.playerId);
    return { slot, sub, stay };
  });
  const changeCount = change?.subs.length ?? 0;

  return (
    <main className="screen game-day">
      <TopBar
        title={<span className="period-title">{label.text}</span>}
        back={paths.team(team.id)}
        action={
          <a className="link" href={paths.gamePlan(game.id)}>
            Plan
          </a>
        }
      />
      <div className="progress" aria-label={`Segment ${game.current + 1} of ${game.plan.length}`}>
        {game.plan.map((_, i) => (
          <span
            key={i}
            className={i < game.current ? 'done' : i === game.current ? 'now' : ''}
            data-period-start={segmentLabel(game.format, i).part === 1 && i > 0 ? '' : undefined}
          />
        ))}
      </div>

      <section className={`lineup ${next ? '' : 'final'}`} aria-label="On court now">
        <div className="lineup-head" aria-hidden>
          <span>On court</span>
          {nextLabel && (
            <span>
              Next · {nextLabel.text}
              {changeCount > 0 && <b className="count">{changeCount} sub{changeCount === 1 ? '' : 's'}</b>}
            </span>
          )}
        </div>
        <ul>
          {rows.map(({ slot, sub, stay }) => (
            <li key={slot.playerId} className={sub ? 'slot change' : 'slot'}>
              <div className="slot-now">
                <Jersey number={player(slot.playerId)?.number ?? ''} />
                <span className="slot-text">
                  <span className="slot-name">{name(slot.playerId)}</span>
                  <span className={`slot-pos ${sub ? 'out' : ''}`}>
                    {sub && <span aria-hidden>▼ </span>}
                    {sub ? `Out · ${position(slot.positionId)}` : position(slot.positionId)}
                  </span>
                </span>
              </div>
              {next && (
                <div className={`slot-next ${sub ? 'in' : 'stays'}`}>
                  {sub ? (
                    <span className="slot-text">
                      <span className="slot-name">{name(sub.in)}</span>
                      <span className="slot-pos in">
                        <span aria-hidden>▲ </span>In · {position(sub.positionId)}
                      </span>
                    </span>
                  ) : (
                    <span className="slot-text">
                      <span className="stay-label">Stays</span>
                      {stay && stay.from !== stay.to && (
                        <span className="slot-pos">→ {position(stay.to)}</span>
                      )}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {next && changeCount === 0 && <p className="lineup-note">No changes — same five stay on.</p>}
        {!next && <p className="lineup-note">This is the final lineup. Tap End game when the game is over.</p>}
      </section>

      <footer className="game-footer">
        <button
          type="button"
          className="btn secondary undo"
          disabled={game.played.length === 0}
          onClick={() => void saveGame(undoSegment(game))}
        >
          ↶ Undo
        </button>
        <button type="button" className="btn big next" onClick={() => void saveGame(nextSegment(game))}>
          {next ? 'Next' : 'End game'}
        </button>
      </footer>
    </main>
  );
}

function Summary({ game, team, byId }: { game: Game; team: Team; byId: Map<string, Player> }) {
  const time = playingTime(game).sort((a, b) => (byId.get(a.playerId)?.name ?? '').localeCompare(byId.get(b.playerId)?.name ?? ''));
  return (
    <main className="screen">
      <TopBar title="Final" back={paths.team(team.id)} />
      <Section title={`Playing time${game.opponent ? ` vs ${game.opponent}` : ''}`}>
        <p className="hint">Segments played out of {game.played.length}.</p>
        <ul className="list">
          {time.map((t) => (
            <li key={t.playerId} className="list-item static">
              <Jersey number={byId.get(t.playerId)?.number ?? ''} />
              <span className="list-title">{byId.get(t.playerId)?.name ?? 'Unknown'}</span>
              <span className="time-bar" aria-hidden>
                <span style={{ width: `${(t.played / Math.max(1, game.played.length)) * 100}%` }} />
              </span>
              <span className="list-meta">{t.played}</span>
            </li>
          ))}
        </ul>
      </Section>
      <footer className="footer static">
        <button type="button" className="btn secondary wide" onClick={() => void saveGame(undoSegment(game))}>
          ↶ Undo end of game
        </button>
      </footer>
    </main>
  );
}
