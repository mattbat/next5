import { useRegisterSW } from 'virtual:pwa-register/react';
import { useInLiveGame } from '../hooks/useInLiveGame';

/**
 * Shows "Update available" when a new version has downloaded (T8). Updates
 * are never applied silently, and the banner stays hidden on the screens of
 * a game in progress. A hidden update still applies the next time the app
 * is closed and reopened.
 */
export function UpdateBanner() {
  const inGame = useInLiveGame();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version each hour while the app is open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh || inGame) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of next5 is ready.</span>
      <button type="button" className="btn small" onClick={() => void updateServiceWorker(true)}>
        Update
      </button>
      <button type="button" className="link" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
