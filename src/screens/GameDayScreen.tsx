import { useState } from 'react';
import { Empty, Jersey, Section, TopBar } from '../components/ui';
import { saveGame } from '../data/repo';
import type { Game, GameEvent, Player, Team } from '../data/types';
import {
  addSegments,
  benchFor,
  describeSwapWarning,
  markArrived,
  planConflicts,
  replan,
  setStatus,
  statusLabel,
  swapNext,
  swapNow,
  type ReplanResult,
  type SwapResult,
} from '../domain/changes';
import { nextSegment, playingTime, segmentLabel, sortLineup, undoSegment } from '../domain/game';
import { substitutions, type Lineup } from '../engine';
import { useGameData } from '../hooks/useGameData';
import { useWakeLock } from '../hooks/useWakeLock';
import { paths } from '../router';
import {
  ChoosePlayerSheet,
  GameMenuSheet,
  PlayerActionsSheet,
  ReplanSheet,
  type PendingSwap,
  type PlayerAction,
} from './GameChanges';

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
  const { game, team, roster, byId } = data;
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
  return <Live game={game} team={team} roster={roster} byId={byId} />;
}

/** Which sheet is open on the game day screen. */
type Sheet =
  | { kind: 'menu' }
  | { kind: 'player'; playerId: string }
  | { kind: 'choose-now'; outId: string; thenOut: boolean }
  | { kind: 'choose-next'; outId: string }
  | { kind: 'replan'; preview: ReplanResult };

function Live({ game, team, roster, byId }: { game: Game; team: Team; roster: Player[]; byId: Map<string, Player> }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A swap that breaks a rule, shown as a warning until the coach confirms it.
  const [pending, setPending] = useState<(PendingSwap & { apply: () => void }) | null>(null);

  // Shown in a fixed order (Guards, Forwards, Centers; then by name) so the
  // same players don't reshuffle between segments.
  const current = sortLineup(game.plan[game.current]!, team.positions, byId);
  const nextPlanned = game.plan[game.current + 1];
  const next: Lineup | undefined = nextPlanned && sortLineup(nextPlanned, team.positions, byId);
  const label = segmentLabel(game.format, game.current);
  const nextLabel = next ? segmentLabel(game.format, game.current + 1) : null;
  const change = next ? substitutions(current, next) : null;
  const goingOut = new Set(change?.subs.map((s) => s.out) ?? []);
  const conflicts = planConflicts(game);

  const position = (id: string | null) => (id === null ? '' : (team.positions.find((p) => p.id === id)?.name ?? id));
  const player = (id: string) => byId.get(id);
  const name = (id: string) => player(id)?.name ?? 'Unknown';

  const close = () => {
    setSheet(null);
    setError(null);
    setPending(null);
  };

  const names = new Map(roster.map((p) => [p.id, p.name]));

  /** Applies a swap now, or first warns about the rules it breaks (never blocks). */
  const confirmOrApply = (inId: string, result: SwapResult, apply: (changed: Game) => void) => {
    if (!result.ok) return setError(result.message);
    const run = () => apply(result.game);
    if (result.warnings.length === 0) return run();
    setPending({
      playerId: inId,
      warnings: result.warnings.map((w) => describeSwapWarning(w, result.game, team.positions, names)),
      apply: run,
    });
  };

  /** Saves a change, then offers to re-plan the rest of the game around it. */
  const saveAndOfferReplan = async (changed: Game) => {
    await saveGame(changed);
    if (changed.current + 1 >= changed.plan.length) return close();
    setError(null);
    setSheet({ kind: 'replan', preview: replan(changed, team, roster) });
  };

  const onPlayerAction = (playerId: string, action: PlayerAction) => {
    switch (action.kind) {
      case 'sub-now':
        return setSheet({ kind: 'choose-now', outId: playerId, thenOut: false });
      case 'injured':
        if (current.some((s) => s.playerId === playerId)) {
          return setSheet({ kind: 'choose-now', outId: playerId, thenOut: true });
        }
        return void saveAndOfferReplan(setStatus(game, playerId, { kind: 'out' }));
      case 'rest':
        return void saveAndOfferReplan(setStatus(game, playerId, { kind: 'resting', segments: action.segments }));
      case 'available':
        return void saveAndOfferReplan(setStatus(game, playerId, null));
      case 'arrived':
        return void saveAndOfferReplan(markArrived(game, playerId));
    }
  };

  const pickNow = (outId: string, inId: string, thenOut: boolean) =>
    confirmOrApply(inId, swapNow(game, team, roster, outId, inId), (changed) => {
      setPending(null);
      if (thenOut) return void saveAndOfferReplan(setStatus(changed, outId, { kind: 'out' }));
      void saveGame(changed);
      close();
    });

  const pickNext = (outId: string, inId: string) =>
    confirmOrApply(inId, swapNext(game, team, roster, outId, inId), (changed) => {
      void saveGame(changed);
      close();
    });

  const overtime = () => {
    const result = addSegments(game, team, roster);
    if (!result.ok) return setError(result.message);
    void saveGame(result.game);
    close();
  };

  return (
    <main className="screen game-day">
      <TopBar
        title={<span className="period-title">{label.text}</span>}
        back={paths.team(team.id)}
        action={
          <button type="button" className="link" onClick={() => setSheet({ kind: 'menu' })}>
            Edit
          </button>
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

      {conflicts.length > 0 && (
        <button type="button" className="conflict" onClick={() => void saveAndOfferReplan(game)}>
          <span>
            {[...new Set(conflicts.map((c) => name(c.playerId)))].join(', ')} can't play but{' '}
            {new Set(conflicts.map((c) => c.playerId)).size === 1 ? 'is' : 'are'} still in the plan.
          </span>
          <b>Re-plan</b>
        </button>
      )}

      <section className="court" aria-label="On court now">
        <h2>On court</h2>
        <ul>
          {current.map((slot) => (
            <li key={slot.playerId} className={goingOut.has(slot.playerId) ? 'leaving' : ''}>
              <button
                type="button"
                className="row-btn"
                aria-label={`${name(slot.playerId)}, ${position(slot.positionId)}: change`}
                onClick={() => setSheet({ kind: 'player', playerId: slot.playerId })}
              >
                <Jersey number={player(slot.playerId)?.number ?? ''} />
                <span className="court-name">{name(slot.playerId)}</span>
                <span className="court-pos">{position(slot.positionId)}</span>
                {goingOut.has(slot.playerId) && <span className="badge out">OUT next</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="changes" aria-label="Next change">
        <h2>{nextLabel ? `Next: ${nextLabel.text}` : 'Last segment'}</h2>
        {change && change.subs.length === 0 && <p className="no-change">No changes — same five stay on.</p>}
        {!next && <p className="no-change">This is the final lineup. Tap End game when the game is over.</p>}
        <ul>
          {change?.subs.map((sub) => (
            <li key={sub.in} className="sub">
              <button
                type="button"
                className="sub-in"
                aria-label={`In: ${name(sub.in)}, ${position(sub.positionId)}. Tap to send in someone else`}
                onClick={() => setSheet({ kind: 'choose-next', outId: sub.in })}
              >
                <span className="arrow in" aria-hidden>
                  ▲
                </span>
                <span className="sub-name">{name(sub.in)}</span>
                <span className="sub-pos">{position(sub.positionId)}</span>
              </button>
              <span className="sub-out">
                <span className="arrow out" aria-hidden>
                  ▼
                </span>
                <span className="sr-only">Out:</span>
                <span className="sub-name">{name(sub.out)}</span>
              </span>
            </li>
          ))}
        </ul>
        {change?.stays.some((s) => s.from !== s.to) && (
          <p className="switches">
            {change.stays
              .filter((s) => s.from !== s.to)
              .map((s) => `${name(s.playerId)} moves to ${position(s.to)}`)
              .join(' · ')}
          </p>
        )}
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
        {!next && (
          <button type="button" className="btn secondary undo" onClick={overtime}>
            + OT
          </button>
        )}
        <button type="button" className="btn big next" onClick={() => void saveGame(nextSegment(game))}>
          {next ? 'Next' : 'End game'}
        </button>
      </footer>

      {sheet?.kind === 'menu' && (
        <GameMenuSheet
          game={game}
          roster={roster}
          onPlayer={(playerId) => setSheet({ kind: 'player', playerId })}
          onReplan={() => setSheet({ kind: 'replan', preview: replan(game, team, roster) })}
          onOvertime={overtime}
          onClose={close}
        />
      )}
      {sheet?.kind === 'player' && player(sheet.playerId) && (
        <PlayerActionsSheet
          game={game}
          player={player(sheet.playerId)!}
          onAction={(action) => onPlayerAction(sheet.playerId, action)}
          onClose={close}
        />
      )}
      {sheet?.kind === 'choose-now' && (
        <ChoosePlayerSheet
          title={`Who replaces ${name(sheet.outId)}?`}
          hint={
            sheet.thenOut
              ? `${name(sheet.outId)} will be out for the rest of the game.`
              : 'Both players get credit for this segment.'
          }
          candidates={benchFor(game, game.current)}
          byId={byId}
          positions={team.positions}
          spotPosition={current.find((s) => s.playerId === sheet.outId)?.positionId ?? null}
          error={error}
          pending={pending}
          onPick={(inId) => pickNow(sheet.outId, inId, sheet.thenOut)}
          onConfirm={() => pending?.apply()}
          onCancelPending={() => setPending(null)}
          onClose={close}
        />
      )}
      {sheet?.kind === 'choose-next' && (
        <ChoosePlayerSheet
          title={`Send in someone instead of ${name(sheet.outId)}?`}
          hint={`Changes the ${nextLabel?.text ?? 'next'} lineup only.`}
          candidates={benchFor(game, game.current + 1)}
          byId={byId}
          positions={team.positions}
          spotPosition={next?.find((s) => s.playerId === sheet.outId)?.positionId ?? null}
          error={error}
          pending={pending}
          onPick={(inId) => pickNext(sheet.outId, inId)}
          onConfirm={() => pending?.apply()}
          onCancelPending={() => setPending(null)}
          onClose={close}
        />
      )}
      {sheet?.kind === 'replan' && (
        <ReplanSheet
          game={game}
          preview={sheet.preview}
          byId={byId}
          positions={team.positions}
          onAccept={(planned) => void saveGame(planned).then(close)}
          onClose={close}
        />
      )}
      {error && !sheet && (
        <p className="error floating" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

function describeEvent(event: GameEvent, game: Game, byId: Map<string, Player>): string {
  const name = (id: string) => byId.get(id)?.name ?? 'Unknown';
  const when = segmentLabel(game.format, event.segment).text;
  switch (event.kind) {
    case 'swap-now':
      return `${when}: ${name(event.in)} replaced ${name(event.out)} mid-segment`;
    case 'swap-next':
      return `${when}: ${name(event.in)} went in instead of ${name(event.out)}`;
    case 'status':
      return `${when}: ${name(event.playerId)} — ${
        event.status ? (statusLabel(event.status, { ...game, current: event.segment }) ?? 'status changed') : 'available again'
      }`;
    case 'replan':
      return `${when}: re-planned (${event.changes} lineup${event.changes === 1 ? '' : 's'} changed)`;
    case 'overtime':
      return `${when}: added ${event.added} overtime segment${event.added === 1 ? '' : 's'}`;
  }
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
      {game.events.length > 0 && (
        <Section title="Changes from the plan">
          <ul className="list">
            {game.events.map((event, i) => (
              <li key={i} className="list-item static">
                <span className="list-title event">{describeEvent(event, game, byId)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <footer className="footer static">
        <button type="button" className="btn secondary wide" onClick={() => void saveGame(undoSegment(game))}>
          ↶ Undo end of game
        </button>
      </footer>
    </main>
  );
}
