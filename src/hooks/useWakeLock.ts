import { useEffect, useState } from 'react';

/** True when this browser can keep the screen on (needs https, D7). */
export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator && window.isSecureContext !== false;
}

export interface WakeLockState {
  /** The screen is being kept on. */
  held: boolean;
  /** Keeping the screen on was wanted but isn't possible, so the phone may lock (B6). */
  failed: boolean;
}

/**
 * Keeps the screen on while `active` (D7). iOS releases the lock when the app
 * is hidden, so it is requested again when the app becomes visible.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [held, setHeld] = useState(false);
  const [refused, setRefused] = useState(false);
  const supported = wakeLockSupported();

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setHeld(true);
        setRefused(false);
        lock.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false);
        setRefused(true);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active, supported]);

  return { held, failed: active && (!supported || refused) };
}
