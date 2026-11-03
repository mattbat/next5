import { Sheet } from '../components/ui';
import type { Lock } from '../engine';
import type { Player } from '../data/types';

/** What can be done with one player in one segment of the plan (G6, G9). */
export type PlanAction =
  | { kind: 'lock'; lock: Lock['kind'] }
  | { kind: 'unlock' }
  | { kind: 'swap' };

export function PlanPlayerSheet({
  player,
  segmentText,
  onCourt,
  positionName,
  lock,
  error,
  onAction,
  onClose,
}: {
  player: Player;
  segmentText: string;
  onCourt: boolean;
  positionName: string | null;
  lock: Lock['kind'] | null;
  error: string | null;
  onAction: (action: PlanAction) => void;
  onClose: () => void;
}) {
  const where = onCourt
    ? `On the court in ${segmentText}${positionName ? ` at ${positionName}` : ''}.`
    : `On the bench in ${segmentText}.`;
  const locked = lock === 'in' ? ' Locked in.' : lock === 'out' ? ' Locked out.' : '';

  return (
    <Sheet title={player.name} onClose={onClose}>
      <p className="hint">
        {where}
        {locked}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn wide" onClick={() => onAction({ kind: 'swap' })}>
          {onCourt ? 'Swap with someone on the bench' : 'Put in for someone'}
        </button>
        {lock !== 'in' && (
          <button type="button" className="btn secondary wide" onClick={() => onAction({ kind: 'lock', lock: 'in' })}>
            {onCourt ? '🔒 Lock in: keep on the court' : '🔒 Lock in: app picks who sits'}
          </button>
        )}
        {lock !== 'out' && (
          <button type="button" className="btn secondary wide" onClick={() => onAction({ kind: 'lock', lock: 'out' })}>
            {onCourt ? '🔒 Lock out: app picks a sub' : '🔒 Lock out: keep on the bench'}
          </button>
        )}
        {lock && (
          <button type="button" className="btn secondary wide" onClick={() => onAction({ kind: 'unlock' })}>
            Unlock
          </button>
        )}
      </div>
    </Sheet>
  );
}
