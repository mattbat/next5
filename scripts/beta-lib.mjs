// Beta builds for preview deployments (REQUIREMENTS.md REL5). Cloudflare
// Pages builds every pushed branch with CF_PAGES=1; `BETA=1` does the same
// locally. Production builds (GitHub Pages) are never beta.

import { readdirSync, readFileSync } from 'node:fs';
import { groupNotes, parseNote } from './release-lib.mjs';

/** True for a beta (preview) build. */
export function isBetaBuild(env) {
  return env.CF_PAGES === '1' || env.BETA === '1';
}

/** The changelog notes in `dir` that haven't been released yet. */
export function readPendingNotes(dir = 'changes') {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((f) => parseNote(readFileSync(`${dir}/${f}`, 'utf8'), `${dir}/${f}`));
}

/**
 * What a beta build shows about itself, or null for a production build:
 * the branch it was built from and the waiting notes, as "Coming next".
 */
export function betaInfo(env, notes = []) {
  if (!isBetaBuild(env)) return null;
  return { branch: env.CF_PAGES_BRANCH || 'local', next: groupNotes(notes) };
}
