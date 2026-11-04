import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { backedUpRecently, backUp, formatBackupDate, lastBackupAt } from '../data/backup';
import { db } from '../data/db';
import { applyUpdate } from '../pwaUpdate';
import { Sheet } from './ui';

/**
 * Shows "Update available" when a new version has downloaded (T8). Updates
 * are never applied silently, and the banner stays hidden during a live game.
 * Before updating, it offers a backup (B5) unless there's no data or one was
 * made in the last day.
 */
export function UpdateBanner({ update = applyUpdate }: { update?: () => Promise<void> }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version each hour while the app is open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
  const [asking, setAsking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inGame = window.location.hash.endsWith('/live');
  if (!needRefresh || inGame) return null;

  const startUpdate = async () => {
    setUpdating(true);
    await update();
  };

  const onUpdate = async () => {
    const hasData = (await db.teams.count()) > 0;
    if (!hasData || backedUpRecently()) return startUpdate();
    setMessage(null);
    setAsking(true);
  };

  const backUpThenUpdate = async () => {
    const before = lastBackupAt();
    const result = await backUp();
    if (lastBackupAt() === before) {
      // Cancelled: don't update without the backup they asked for.
      setMessage(`${result} Nothing was updated.`);
      return;
    }
    await startUpdate();
  };

  if (asking) {
    return (
      <Sheet title="Update next5" onClose={() => setAsking(false)}>
        <p>Updating keeps your teams and games on this phone. Want a backup first, just in case?</p>
        <p className="hint">Last backup: {formatBackupDate(lastBackupAt())}</p>
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn wide" disabled={updating} onClick={() => void backUpThenUpdate()}>
            {updating ? 'Updating…' : 'Back up, then update'}
          </button>
          <button type="button" className="btn secondary wide" disabled={updating} onClick={() => void startUpdate()}>
            Update without a backup
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <div className="update-banner" role="status">
      <span>A new version of next5 is ready.</span>
      <button type="button" className="btn small" disabled={updating} onClick={() => void onUpdate()}>
        {updating ? 'Updating…' : 'Update'}
      </button>
      <button type="button" className="link" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
