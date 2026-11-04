import { useState } from 'react';
import { Jersey, Sheet } from '../components/ui';
import type { Game, Player, Position } from '../data/types';
import { benchFor, statusLabel, type ReplanResult } from '../domain/changes';
import { describeWarning, segmentLabel, sortLineup } from '../domain/game';
import { paths } from '../router';
import { HelpLink } from '../help/parts';

/** Sheets for game-day changes (REQUIREMENTS.md D4–D6, D11). */

function PlayerRow({ player, meta, onClick }: { player: Player | undefined; meta?: string | null; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="list-item" onClick={onClick}>
        <Jersey number={player?.number ?? ''} />
        <span className="list-title">
          {player?.name ?? 'Unknown'}
          {meta && <span className="list-sub">{meta}</span>}
        </span>
        <span className="chevron">›</span>
      </button>
    </li>
  );
}

/** A swap that breaks a rule, waiting for the coach to confirm it. */
export interface PendingSwap {
  playerId: string;
  warnings: string[];
}

/**
 * Pick who comes in. Players who can play the open spot's position are listed
 * first; everyone else follows. Each player shows the positions they play.
 */
export function ChoosePlayerSheet({
  title,
  hint,
  candidates,
  byId,
  positions,
  spotPosition,
  error,
  pending,
  onPick,
  onConfirm,
  onCancelPending,
  onClose,
}: {
  title: string;
  hint?: string;
  candidates: string[];
  byId: Map<string, Player>;
  positions: Position[];
  /** Position of the spot being filled; its players are listed first. */
  spotPosition: string | null;
  error?: string | null;
  pending?: PendingSwap | null;
  onPick: (playerId: string) => void;
  onConfirm: () => void;
  onCancelPending: () => void;
  onClose: () => void;
}) {
  const byName = (a: string, b: string) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '');
  const canPlaySpot = (id: string) => spotPosition !== null && byId.get(id)?.skills[spotPosition] !== undefined;
  const fits = candidates.filter(canPlaySpot).sort(byName);
  const others = candidates.filter((id) => !canPlaySpot(id)).sort(byName);
  const spotName = positions.find((p) => p.id === spotPosition)?.name;

  const row = (id: string) => {
    const player = byId.get(id);
    return (
      <li key={id}>
        <button type="button" className="list-item" onClick={() => onPick(id)}>
          <Jersey number={player?.number ?? ''} />
          <span className="list-title">{player?.name ?? 'Unknown'}</span>
          <span className="chips" aria-label="Plays">
            {positions
              .filter((pos) => player?.skills[pos.id] !== undefined)
              .map((pos) => (
                <span key={pos.id} className={`chip ${pos.id === spotPosition ? 'match' : ''}`} title={pos.name}>
                  {pos.short}
                </span>
              ))}
          </span>
        </button>
      </li>
    );
  };

  if (pending) {
    const player = byId.get(pending.playerId);
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="confirm" role="alert">
          <strong>Heads up: putting in {player?.name ?? 'this player'} breaks your rules.</strong>
          <ul className="warnings">
            {pending.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        <div className="footer-row">
          <button type="button" className="btn secondary" onClick={onCancelPending}>
            Pick someone else
          </button>
          <button type="button" className="btn grow" onClick={onConfirm}>
            Swap anyway
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {candidates.length === 0 && <p className="empty">Nobody is available.</p>}
      {fits.length > 0 && (
        <>
          <h3 className="sheet-sub">Can play {spotName}</h3>
          <ul className="list" aria-label={`Can play ${spotName}`}>
            {fits.map(row)}
          </ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <h3 className="sheet-sub">{fits.length > 0 ? 'Other players' : 'Players'}</h3>
          <ul className="list" aria-label={fits.length > 0 ? 'Other players' : 'Players'}>
            {others.map(row)}
          </ul>
        </>
      )}
    </Sheet>
  );
}

export type PlayerAction =
  | { kind: 'sub-now' }
  | { kind: 'injured' }
  | { kind: 'rest'; segments: number }
  | { kind: 'available' }
  | { kind: 'arrived' };

/** What can be done with one player during a game. */
export function PlayerActionsSheet({
  game,
  player,
  onAction,
  onClose,
}: {
  game: Game;
  player: Player;
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}) {
  const onCourt = game.plan[game.current]?.some((s) => s.playerId === player.id) ?? false;
  const attending = game.attending.includes(player.id);
  const status = game.statuses[player.id];
  const label = statusLabel(status, game);
  const hasNext = game.current + 1 < game.plan.length;

  return (
    <Sheet title={player.name} onClose={onClose}>
      <p className="hint">
        {!attending ? 'Not marked as attending this game.' : onCourt ? 'On the court now.' : 'On the bench.'}
        {label && ` ${label}.`}
      </p>
      <div className="actions">
        {!attending && (
          <button type="button" className="btn wide" onClick={() => onAction({ kind: 'arrived' })}>
            Arrived: add to this game
          </button>
        )}
        {onCourt && (
          <button type="button" className="btn wide" onClick={() => onAction({ kind: 'sub-now' })}>
            Sub out now
          </button>
        )}
        {attending && status?.kind !== 'out' && (
          <button type="button" className="btn secondary wide" onClick={() => onAction({ kind: 'injured' })}>
            {onCourt ? 'Injured or leaving: sub out for the game' : 'Injured or left: out for the game'}
          </button>
        )}
        {attending && status?.kind !== 'out' && hasNext && (
          <div className="action-row">
            <span>Rest for</span>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className="btn secondary small" onClick={() => onAction({ kind: 'rest', segments: n })}>
                {n} segment{n === 1 ? '' : 's'}
              </button>
            ))}
          </div>
        )}
        {attending && label && (
          <button type="button" className="btn secondary wide" onClick={() => onAction({ kind: 'available' })}>
            Available again
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Preview of a re-plan: which upcoming lineups change, before accepting (D6). */
export function ReplanSheet({
  game,
  preview,
  byId,
  positions,
  onAccept,
  onClose,
}: {
  game: Game;
  preview: ReplanResult;
  byId: Map<string, Player>;
  positions: Position[];
  onAccept: (game: Game) => void;
  onClose: () => void;
}) {
  const name = (id: string) => byId.get(id)?.name ?? 'Unknown';
  if (!preview.ok) {
    return (
      <Sheet title="Can't re-plan" onClose={onClose}>
        <p className="error" role="alert">
          {preview.message}
        </p>
        <button type="button" className="btn secondary wide" onClick={onClose}>
          OK
        </button>
      </Sheet>
    );
  }
  const names = new Map([...byId.values()].map((p) => [p.id, p.name]));
  return (
    <Sheet title="Re-plan the rest of the game" onClose={onClose}>
      <p className="hint">
        {preview.changed.length === 0
          ? 'No lineups need to change.'
          : `${preview.changed.length} upcoming lineup${preview.changed.length === 1 ? '' : 's'} will change. New players are highlighted.`}
      </p>
      <ul className="replan">
        {preview.changed.map((segment) => {
          const before = new Set(game.plan[segment]?.map((s) => s.playerId));
          return (
            <li key={segment}>
              <span className="replan-label">{segmentLabel(game.format, segment).text}</span>
              <span className="replan-names">
                {sortLineup(preview.game.plan[segment]!, positions, byId).map((s) => (
                  <span key={s.playerId} className={before.has(s.playerId) ? '' : 'new'}>
                    {name(s.playerId)}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      {preview.warnings.length > 0 && (
        <ul className="warnings">
          {preview.warnings.map((w, i) => (
            <li key={i}>{describeWarning(w, preview.game, names)}</li>
          ))}
        </ul>
      )}
      <div className="footer-row">
        <button type="button" className="btn secondary" onClick={onClose}>
          Keep plan
        </button>
        <button type="button" className="btn grow" onClick={() => onAccept(preview.game)}>
          Use new plan
        </button>
      </div>
    </Sheet>
  );
}

/** The Edit menu on game day: everyone's status, re-plan, overtime. */
export function GameMenuSheet({
  game,
  roster,
  onPlayer,
  onReplan,
  onOvertime,
  onShare,
  onClose,
}: {
  game: Game;
  roster: Player[];
  onPlayer: (playerId: string) => void;
  onReplan: () => void;
  onOvertime: () => void;
  /** Hand the game to the other phone mid-game (SH1). */
  onShare: () => void;
  onClose: () => void;
}) {
  const [showAbsent, setShowAbsent] = useState(false);
  const onCourt = new Set(game.plan[game.current]?.map((s) => s.playerId));
  const bench = new Set(benchFor(game, game.current));
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  const attending = sorted.filter((p) => game.attending.includes(p.id));
  const absent = sorted.filter((p) => !game.attending.includes(p.id) && p.active);
  const where = (p: Player) =>
    statusLabel(game.statuses[p.id], game) ?? (onCourt.has(p.id) ? 'On the court' : bench.has(p.id) ? 'On the bench' : null);

  return (
    <Sheet title="Game changes" onClose={onClose}>
      <div className="actions">
        <button type="button" className="btn wide" onClick={onReplan} disabled={game.current + 1 >= game.plan.length}>
          Re-plan rest of game
        </button>
        <button type="button" className="btn secondary wide" onClick={onOvertime}>
          + Add overtime segment
        </button>
        <button type="button" className="btn secondary wide" onClick={onShare}>
          Share game
        </button>
        <a className="btn secondary wide" href={paths.gameSetup(game.id)}>
          Game setup
        </a>
        <HelpLink topic="changes">Help with injuries, rests and subs</HelpLink>
      </div>
      <h3 className="sheet-sub">Players · tap to change</h3>
      <ul className="list">
        {attending.map((p) => (
          <PlayerRow key={p.id} player={p} meta={where(p)} onClick={() => onPlayer(p.id)} />
        ))}
      </ul>
      {absent.length > 0 && (
        <>
          <button type="button" className="link" onClick={() => setShowAbsent(!showAbsent)} aria-expanded={showAbsent}>
            {showAbsent ? 'Hide' : 'Show'} players not here ({absent.length})
          </button>
          {showAbsent && (
            <ul className="list">
              {absent.map((p) => (
                <PlayerRow key={p.id} player={p} meta="Not here" onClick={() => onPlayer(p.id)} />
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
