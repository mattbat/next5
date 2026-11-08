import type { BetaInfo } from '../scripts/beta-lib.mjs';

/**
 * Set on a beta (preview) build of a branch, null on the real app (REL5).
 * A module of its own so tests can mock it.
 */
export const BETA: BetaInfo | null = __BETA__;

/** "0.3.0", or "0.3.0 beta · claude/practice · ab12cd3" on a beta build. */
export function versionLabel(beta = BETA): string {
  return beta ? `${__APP_VERSION__} beta · ${beta.branch} · ${__COMMIT__}` : __APP_VERSION__;
}
