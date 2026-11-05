/**
 * Whether the first-run intro (H-3) has been seen. Kept in localStorage: it
 * only matters on this device.
 */
export const INTRO_KEY = 'next5.introSeen';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    // Storage unavailable (private browsing): don't keep showing it.
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Private browsing: it just shows again next time.
  }
}
