// Types for beta-lib.mjs, so vite.config.ts can import it.

export interface Note {
  type: 'new' | 'improved' | 'fixed';
  text: string;
}

export interface BetaInfo {
  /** The branch it was built from. */
  branch: string;
  /** Changelog notes not released yet, grouped by type. */
  next: { new?: string[]; improved?: string[]; fixed?: string[] };
}

export function isBetaBuild(env: Record<string, string | undefined>): boolean;
export function readPendingNotes(dir?: string): Note[];
export function betaInfo(env: Record<string, string | undefined>, notes?: Note[]): BetaInfo | null;
