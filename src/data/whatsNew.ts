import changelog from '../changelog.json';

/**
 * What changed in each release (REL3), from src/changelog.json, which
 * `npm run release` writes. Newest first.
 */
export interface Release {
  version: string;
  /** yyyy-mm-dd */
  date: string;
  new?: string[];
  improved?: string[];
  fixed?: string[];
}

export const RELEASES: Release[] = changelog;

export const SEEN_KEY = 'next5.seenVersion';

export function seenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    // Storage unavailable: treat it as seen, so the sheet doesn't show every time.
    return __APP_VERSION__;
  }
}

export function markVersionSeen(version = __APP_VERSION__): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Private browsing: it may show once more.
  }
}

/**
 * The release to show once after an update (REL3), or null. On a new phone
 * (no version seen and no teams yet) there's nothing to show: the intro
 * covers it, and this version simply counts as seen.
 */
export function releaseToShow(hasTeams: boolean, current = __APP_VERSION__): Release | null {
  const seen = seenVersion();
  if (seen === current) return null;
  if (seen === null && !hasTeams) {
    markVersionSeen(current);
    return null;
  }
  return RELEASES.find((r) => r.version === current) ?? null;
}
