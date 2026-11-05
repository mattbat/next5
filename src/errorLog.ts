/**
 * Which unexpected errors the error banner shows, and a note of the last one
 * (shown or not) for the Diagnostics page.
 */

export interface LoggedError {
  message: string;
  /** Where it came from: a script URL, "promise", or "unknown". */
  source: string;
  shown: boolean;
  at: number;
}

const KEY = 'next5.lastError';

/**
 * True for an error thrown by next5's own code. Browsers hide the details of
 * errors from other sites' scripts (for example a Safari extension, or the
 * Share sheet), reporting them as "Script error." with no error object or
 * file. Those aren't next5's, and there's nothing the coach can do about them.
 */
export function isOwnError(e: Pick<ErrorEvent, 'error' | 'filename'>): boolean {
  if (e.error != null) return true;
  return e.filename !== '' && e.filename.startsWith(window.location.origin);
}

export function logError(entry: Omit<LoggedError, 'at'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...entry, at: Date.now() }));
  } catch {
    // Storage unavailable: nothing to note.
  }
}

export function lastError(): LoggedError | null {
  try {
    const value = localStorage.getItem(KEY);
    return value ? (JSON.parse(value) as LoggedError) : null;
  } catch {
    return null;
  }
}
