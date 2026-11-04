import { takeBack } from '../data/repo';

/** Wording and actions shared by the screens that show a shared game (SH5). */

/** "at 7:42 PM" today, or "Nov 8 at 7:42 PM". */
export function sharedAt(time: number | undefined): string {
  if (time === undefined) return '';
  const when = new Date(time);
  const sameDay = when.toDateString() === new Date().toDateString();
  const clock = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `at ${clock}` : `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${clock}`;
}

/** Take back control after confirming. Resolves true if it was taken back. */
export async function confirmTakeBack(gameId: string): Promise<boolean> {
  const ok = window.confirm(
    'Take back control? Run the game on this phone only if the other phone has stopped. Anything done there since you shared it stays on that phone.',
  );
  if (ok) await takeBack(gameId);
  return ok;
}
