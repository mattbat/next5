import { useState } from 'react';
import { Empty, Info, Jersey, PositionChip, PositionChips, Section, Segmented, TopBar } from '../components/ui';
import { changedSinceSent, getGame, saveGame, sharedAway, updateGame } from '../data/repo';
import type { Game, Player, Team } from '../data/types';
import { benchFor } from '../domain/changes';
import { describeError, describeWarning, planGame, segmentLabel, sortLineup, startGame } from '../domain/game';
import {
  isLineupLocked,
  lockLineup,
  lockOf,
  setLock,
  shuffleFrom,
  swapInPlan,
  unlock,
  unlockSegment,
  type PlanEdit,
} from '../domain/planning';
import { useGameData } from '../hooks/useGameData';
import { navigate, paths } from '../router';
import { wakeLockSupported } from '../hooks/useWakeLock';
import { ChoosePlayerSheet, SCREEN_MAY_LOCK, type PendingSwap } from './GameChanges';
import { PlanPlayerSheet, type PlanAction } from './PlanPlayerSheet';
import { ShareGameSheet } from './ShareGameSheet';
import { confirmTakeBack, sharedAt } from './shareText';

/**
 * Plan review and editing (G4–G9): step through the segments one at a time to
 * see who plays, lock players in or out, swap, and regenerate from a segment;
 * or see the whole plan as a grid.
 */
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

/** The parts of a game a plan edit changes, kept so it can be undone. */
type Snapshot = Pick<Game, 'plan' | 'warnings' | 'locks' | 'seed'>;

const snapshot = (game: Game): Snapshot => ({
  plan: game.plan,
  warnings: game.warnings,
  locks: game.locks,
  seed: game.seed,
});

/** What the last edit did, shown under the segment until the next one. */
interface Notice {
  text: string;
  warnings: string[];
  undo: Snapshot;
}

type Sheet =
  | { kind: 'player'; playerId: string }
  | { kind: 'share' }
  /** Pick the other half of a swap for `playerId`, who is on the court or the bench. */
  | { kind: 'swap'; playerId: string; onCourt: boolean };

function Plan({ game, team, roster, byId }: { game: Game; team: Team; roster: Player[]; byId: Map<string, Player> }) {
  const [view, setView] = useState<'segments' | 'grid'>('segments');
  // During a game (opened from Game Day's Edit menu) start at the segment on the court.
  const [segment, setSegment] = useState(() => (game.status === 'live' ? game.current : 0));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<(PendingSwap & { apply: () => void }) | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const names = new Map(roster.map((p) => [p.id, p.name]));
  const name = (id: string) => byId.get(id)?.name ?? 'Unknown';
  const short = (positionId: string | null) =>
    positionId === null ? '•' : (team.positions.find((p) => p.id === positionId)?.short ?? positionId);
  const positionName = (positionId: string | null) =>
    positionId === null ? null : (team.positions.find((p) => p.id === positionId)?.name ?? positionId);

  const isPlanned = game.status === 'planned';
  const isLive = game.status === 'live';
  // Shared with the other phone, which runs the game until it comes back (SH5).
  const shared = sharedAway(game);
  const count = game.plan.length;
  const at = Math.min(segment, Math.max(0, count - 1));
  const label = count > 0 ? segmentLabel(game.format, at) : null;

  const players = game.attending
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const totals = new Map(players.map((p) => [p.id, game.plan.filter((l) => l.some((s) => s.playerId === p.id)).length]));

  const close = () => {
    setSheet(null);
    setSheetError(null);
    setPending(null);
  };

  const save = (changes: Snapshot) => updateGame(game.id, changes);

  /**
   * The latest saved copy of the game. Every edit starts from it, so a quick
   * second tap can't undo the first one with an older copy of the plan.
   */
  const latest = async () => (await getGame(game.id)) ?? game;

  /** Saves an edit and says what else it changed, with Undo. */
  const apply = async (before: Game, edit: Extract<PlanEdit, { ok: true }>, what: string) => {
    const undo = snapshot(before);
    await save(snapshot(edit.game));
    const others = edit.changed.filter((s) => s !== at).map((s) => segmentLabel(game.format, s).text);
    const also =
      others.length === 0
        ? ''
        : others.length <= 3
          ? ` To keep things fair, ${others.join(', ')} changed too.`
          : ` To keep things fair, ${others.length} other lineups changed too.`;
    setNotice({ text: `${what}.${also}`, warnings: edit.newWarnings.map((w) => describeWarning(w, edit.game, names)), undo });
    setError(null);
    close();
  };

  /** Applies an edit, or shows why it can't be made. */
  const tryEdit = async (make: (current: Game) => PlanEdit, what: string) => {
    const before = await latest();
    const edit = make(before);
    if (!edit.ok) return setSheetError(edit.message);
    await apply(before, edit, what);
  };

  /** Saves a change to the locks only; the plan already fits it. */
  const saveLocks = async (change: (current: Game) => Game, what: string) => {
    const before = await latest();
    await save(snapshot(change(before)));
    setNotice({ text: `${what}.`, warnings: [], undo: snapshot(before) });
    close();
  };

  const onAction = (playerId: string, action: PlanAction) => {
    const onCourt = game.plan[at]!.some((s) => s.playerId === playerId);
    switch (action.kind) {
      case 'swap':
        setSheetError(null);
        return setSheet({ kind: 'swap', playerId, onCourt });
      case 'lock':
        return void tryEdit(
          (current) => setLock(current, team, roster, at, playerId, action.lock),
          `${name(playerId)} locked ${action.lock} for ${label!.text}`,
        );
      case 'unlock':
        return void saveLocks((current) => unlock(current, at, playerId), `${name(playerId)} unlocked for ${label!.text}`);
    }
  };

  /** Swaps, first confirming any rules it breaks (G9). */
  const swap = async (outId: string, inId: string) => {
    const before = await latest();
    const edit = swapInPlan(before, team, roster, at, outId, inId);
    if (!edit.ok) return setSheetError(edit.message);
    const what = `${name(inId)} in for ${name(outId)} in ${label!.text}`;
    if (edit.newWarnings.length === 0) return apply(before, edit, what);
    setPending({
      playerId: inId,
      warnings: edit.newWarnings.map((w) => describeWarning(w, edit.game, names)),
      apply: () => void apply(before, edit, what),
    });
  };

  const regenerate = async () => {
    const before = await latest();
    const seed = before.seed + 1;
    const outcome = planGame({ ...before, plan: [] }, team, roster, seed);
    if (!outcome.ok) {
      setError(describeError(outcome.error, before, team.positions));
      return;
    }
    setError(null);
    await updateGame(game.id, { plan: outcome.plan, warnings: outcome.warnings, seed });
    setNotice({ text: 'New plan made. Locks were kept.', warnings: [], undo: snapshot(before) });
  };

  const shuffleHere = async () => {
    const before = await latest();
    const edit = shuffleFrom(before, team, roster, at);
    if (!edit.ok) return setError(edit.message);
    await apply(before, edit, `New lineups from ${label!.text} on. Earlier segments and locks were kept`);
  };

  const toggleLineupLock = () => {
    if (isLineupLocked(game, at)) return void saveLocks((current) => unlockSegment(current, at), `${label!.text} unlocked`);
    void saveLocks((current) => lockLineup(current, at), `${label!.text} lineup locked`);
  };

  const undo = async () => {
    if (!notice) return;
    await save(notice.undo);
    setNotice(null);
  };

  const start = async () => {
    await saveGame(startGame(game));
    navigate(paths.gameLive(game.id));
  };

  const onTakeBack = async () => {
    if (await confirmTakeBack(game.id)) setSentMessage(null);
  };

  const go = (index: number) => {
    setSegment(index);
    setView('segments');
  };

  const title = game.opponent ? `vs ${game.opponent}` : 'Game plan';
  const lineup = count > 0 ? sortLineup(game.plan[at]!, team.positions, byId) : [];
  const onCourtIds = new Set(lineup.map((s) => s.playerId));
  const bench = players.filter((p) => !onCourtIds.has(p.id));
  const hasLocks = (s: number) => game.locks.some((l) => l.segment === s && game.attending.includes(l.playerId));
  const sheetPlayer = sheet && sheet.kind !== 'share' ? byId.get(sheet.playerId) : undefined;
  // Segments grouped by period for the jump strip: Q1 [1 2], Q2 [1 2]…
  const periods: { label: string; segments: number[] }[] = [];
  game.plan.forEach((_, i) => {
    const l = segmentLabel(game.format, i);
    if (l.part === 1) periods.push({ label: l.period, segments: [] });
    periods.at(-1)!.segments.push(i);
  });

  const lockBadge = (playerId: string) => {
    const kind = lockOf(game, at, playerId);
    if (!kind) return null;
    return (
      <span className={`badge lock ${kind}`} aria-label={kind === 'in' ? 'locked in' : 'locked out'}>
        🔒 {kind === 'in' ? 'In' : 'Out'}
      </span>
    );
  };

  return (
    <main className="screen with-footer">
      <TopBar
        title={title}
        back={isLive ? paths.gameLive(game.id) : paths.team(team.id)}
        action={
          <a className="link" href={paths.gameSetup(game.id)}>
            Setup
          </a>
        }
      />

      {count === 0 && <Empty>No plan yet. Go to Setup and tap Generate plan.</Empty>}

      {shared && (
        <aside className="callout" aria-label="Shared with the other phone">
          <strong>Shared with the other phone</strong>
          <p>
            Shared {sharedAt(game.handoff!.sentAt)}. The game runs on that phone until it’s shared back.
            {isPlanned && changedSinceSent(game) && <b> You’ve changed the plan since. Share it again before tip-off.</b>}
          </p>
          <button type="button" className="link" onClick={() => void onTakeBack()}>
            Take back control
          </button>
        </aside>
      )}
      {sentMessage && (
        <p className="notice" role="status">
          {sentMessage}
        </p>
      )}
      {count > 0 && !shared && isPlanned && (
        <p className="hint send-hint">
          Running the subs on another phone?{' '}
          <button type="button" className="link" onClick={() => setSheet({ kind: 'share' })}>
            Share game
          </button>
        </p>
      )}

      {count > 0 && (
        <Segmented
          label="Plan view"
          options={[
            { value: 'segments', label: 'Segments' },
            { value: 'grid', label: 'Grid' },
          ]}
          value={view}
          onChange={setView}
        />
      )}

      {game.warnings.length > 0 && (
        <Section title="Heads up">
          <ul className="warnings">
            {game.warnings.map((w, i) => (
              <li key={i}>{describeWarning(w, game, names)}</li>
            ))}
          </ul>
        </Section>
      )}

      {count > 0 && view === 'segments' && label && (
        <section className="seg-view" aria-label="Segment">
          <div className="seg-nav">
            <button
              type="button"
              className="seg-step"
              aria-label="Previous segment"
              disabled={at === 0}
              onClick={() => setSegment(at - 1)}
            >
              ‹
            </button>
            <h2 className="seg-title" aria-live="polite">
              {label.text}
            </h2>
            <button
              type="button"
              className="seg-step"
              aria-label="Next segment"
              disabled={at >= count - 1}
              onClick={() => setSegment(at + 1)}
            >
              ›
            </button>
          </div>
          <div className="seg-chips" role="group" aria-label="Jump to segment">
            {periods.map((period) => (
              <div key={period.label} className="seg-group">
                <span className="seg-group-label" aria-hidden>
                  {period.label}
                </span>
                <div className="seg-group-chips">
                  {period.segments.map((i) => {
                    const l = segmentLabel(game.format, i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`seg-chip ${i === at ? 'on' : ''} ${i < game.played.length ? 'done' : ''}`}
                        aria-label={`${l.text}${hasLocks(i) ? ', has locks' : ''}`}
                        aria-current={i === at ? 'true' : undefined}
                        onClick={() => setSegment(i)}
                      >
                        {l.of > 1 ? l.part : '•'}
                        {hasLocks(i) && <span className="seg-lock" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {notice && (
            <div className="notice plan-notice" role="status">
              <p>{notice.text}</p>
              {notice.warnings.length > 0 && (
                <ul className="warnings">
                  {notice.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="notice-actions">
                <button type="button" className="link" onClick={() => void undo()}>
                  ↶ Undo
                </button>
                <button type="button" className="link" onClick={() => setNotice(null)}>
                  OK
                </button>
              </div>
            </div>
          )}

          <h3 className="sheet-sub">{isLive && at === game.current ? 'On court now' : 'On court'}</h3>
          <ul className="lineup" aria-label="On court">
            {lineup.map((slot) => (
              <li key={slot.playerId}>
                <button
                  type="button"
                  className="row-btn"
                  disabled={!isPlanned}
                  aria-label={`${name(slot.playerId)}, ${positionName(slot.positionId) ?? 'no position'}${lockOf(game, at, slot.playerId) === 'in' ? ', locked in' : ''}`}
                  onClick={() => setSheet({ kind: 'player', playerId: slot.playerId })}
                >
                  <Jersey number={byId.get(slot.playerId)?.number ?? ''} />
                  <span className="court-name">{name(slot.playerId)}</span>
                  {lockBadge(slot.playerId)}
                  <PositionChip id={slot.positionId} positions={team.positions} />
                </button>
              </li>
            ))}
          </ul>

          <h3 className="sheet-sub">Bench</h3>
          <ul className="lineup bench" aria-label="Bench">
            {bench.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="row-btn"
                  disabled={!isPlanned}
                  aria-label={`${p.name}, on the bench${lockOf(game, at, p.id) === 'out' ? ', locked out' : ''}`}
                  onClick={() => setSheet({ kind: 'player', playerId: p.id })}
                >
                  <Jersey number={p.number} />
                  <span className="court-name">{p.name}</span>
                  {lockBadge(p.id)}
                  {/* What they could come in at, to help pick a swap. */}
                  <PositionChips skills={p.skills} positions={team.positions} />
                </button>
              </li>
            ))}
          </ul>

          {isPlanned && (
            <div className="seg-actions">
              <button type="button" className="btn secondary" onClick={toggleLineupLock}>
                {isLineupLocked(game, at) ? 'Unlock lineup' : '🔒 Lock lineup'}
              </button>
              <button type="button" className="btn secondary" onClick={() => void shuffleHere()}>
                ↻ Redo from here
              </button>
            </div>
          )}
          {isPlanned && (
            <p className="hint">
              Tap a player to swap or lock them. Every change keeps your locks and changes as little else as possible.
            </p>
          )}
          {isLive && (
            <p className="hint">The plan for the whole game. To change a lineup, go back to the game and tap Edit.</p>
          )}
        </section>
      )}

      {count > 0 && view === 'grid' && (
        <Section
          title="Rotation"
          aside={
            <Info label="the rotation grid">
              Each column is one segment between substitutions. A letter shows the position a player covers in that
              segment; an empty cell means they're on the bench. A ringed cell is locked in, ✕ is locked out. Tap a
              column to open that segment. The last column is their total.
            </Info>
          }
        >
          <div className="grid-scroll">
            <table className="plan-grid">
              <thead>
                <tr>
                  <th className="name-col">Player</th>
                  {game.plan.map((_, i) => {
                    const l = segmentLabel(game.format, i);
                    return (
                      <th
                        key={i}
                        className={`${l.part === 1 ? 'period-start' : ''} ${i < game.played.length ? 'done' : ''}`}
                      >
                        <button type="button" className="th-btn" aria-label={`Open ${l.text}`} onClick={() => go(i)}>
                          <span className="th-period">{l.part === 1 ? l.period : ''}</span>
                          <span className="th-part">{l.of > 1 ? l.part : ''}</span>
                        </button>
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
                    {game.plan.map((l, i) => {
                      const slot = l.find((s) => s.playerId === p.id);
                      const sl = segmentLabel(game.format, i);
                      const lock = lockOf(game, i, p.id);
                      const lockText = lock === 'in' ? ', locked in' : lock === 'out' ? ', locked out' : '';
                      return (
                        <td
                          key={i}
                          className={`${slot ? 'on' : 'off'} ${sl.part === 1 ? 'period-start' : ''} ${i < game.played.length ? 'done' : ''} ${lock ? `locked-${lock}` : ''}`}
                          aria-label={`${sl.text}: ${slot ? short(slot.positionId) : 'bench'}${lockText}`}
                        >
                          {slot ? short(slot.positionId) : lock === 'out' ? '✕' : ''}
                        </td>
                      );
                    })}
                    <td className="total-col">{totals.get(p.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notice && view === 'grid' && (
            <p className="hint" role="status">
              {notice.text}
            </p>
          )}
        </Section>
      )}

      {isPlanned && count > 0 && !wakeLockSupported() && <p className="hint">{SCREEN_MAY_LOCK}</p>}

      <footer className="footer">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {isPlanned && count > 0 && (
          <div className="footer-row">
            <button type="button" className="btn secondary" onClick={() => void regenerate()}>
              ↻ Shuffle
            </button>
            {shared ? (
              <button type="button" className="btn big grow" onClick={() => setSheet({ kind: 'share' })}>
                Share again
              </button>
            ) : (
              <button type="button" className="btn big grow" onClick={() => void start()}>
                Start game
              </button>
            )}
          </div>
        )}
        {game.status === 'live' && (
          <a className="btn wide big" href={paths.gameLive(game.id)}>
            Back to game
          </a>
        )}
      </footer>

      {sheet?.kind === 'share' && (
        <ShareGameSheet
          game={game}
          team={team}
          roster={roster}
          onSent={(message) => {
            setSentMessage(message);
            close();
          }}
          onClose={close}
        />
      )}
      {sheet?.kind === 'player' && sheetPlayer && label && (
        <PlanPlayerSheet
          player={sheetPlayer}
          segmentText={label.text}
          onCourt={onCourtIds.has(sheet.playerId)}
          positionName={positionName(lineup.find((s) => s.playerId === sheet.playerId)?.positionId ?? null)}
          lock={lockOf(game, at, sheet.playerId)}
          error={sheetError}
          onAction={(action) => onAction(sheet.playerId, action)}
          onClose={close}
        />
      )}
      {sheet?.kind === 'swap' && label && (
        <ChoosePlayerSheet
          title={sheet.onCourt ? `Who comes in for ${name(sheet.playerId)}?` : `Who sits for ${name(sheet.playerId)}?`}
          hint={`${label.text}. The swap is locked in, and the rest of the plan adjusts to keep playing time fair.`}
          candidates={sheet.onCourt ? benchFor(game, at) : lineup.map((s) => s.playerId)}
          byId={byId}
          positions={team.positions}
          spotPosition={sheet.onCourt ? (lineup.find((s) => s.playerId === sheet.playerId)?.positionId ?? null) : null}
          error={sheetError}
          pending={pending}
          onPick={(id) => void (sheet.onCourt ? swap(sheet.playerId, id) : swap(id, sheet.playerId))}
          onConfirm={() => pending?.apply()}
          onCancelPending={() => setPending(null)}
          onClose={close}
        />
      )}
    </main>
  );
}

