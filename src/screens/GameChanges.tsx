import { useState } from 'react';
import { Jersey, Sheet } from '../components/ui';
import type { Game, Player } from '../data/types';
import { benchFor, statusLabel, type ReplanResult } from '../domain/changes';
import { describeWarning, segmentLabel } from '../domain/game';

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

/** Pick a player from a list, e.g. who comes in. */
export function ChoosePlayerSheet({
  title,
  hint,
  candidates,
  byId,
  error,
  onPick,
  onClose,
}: {
  title: string;
  hint?: string;
  candidates: string[];
  byId: Map<string, Player>;
  error?: string | null;
  onPick: (playerId: string) => void;
  onClose: () => void;
}) {
  const sorted = [...candidates].sort((a, b) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''));
  return (
    <Sheet title={title} onClose={onClose}>
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="empty">Nobody is available.</p>
      ) : (
        <ul className="list">
          {sorted.map((id) => (
            <PlayerRow key={id} player={byId.get(id)} onClick={() => onPick(id)} />
          ))}
        </ul>
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
  onAccept,
  onClose,
}: {
  game: Game;
  preview: ReplanResult;
  byId: Map<string, Player>;
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
                {preview.game.plan[segment]!.map((s) => (
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
  onClose,
}: {
  game: Game;
  roster: Player[];
  onPlayer: (playerId: string) => void;
  onReplan: () => void;
  onOvertime: () => void;
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
