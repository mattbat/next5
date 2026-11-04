import { useEffect, useState } from 'react';
import type { Game } from './data/types';

/**
 * Tiny hash router. GitHub Pages can't fall back to index.html for deep
 * links, so routes live after the # (REQUIREMENTS.md T4).
 */

export type Route =
  | { name: 'teams' }
  | { name: 'diagnostics' }
  | { name: 'settings' }
  | { name: 'team'; teamId: string }
  | { name: 'game-setup'; gameId: string }
  | { name: 'game-plan'; gameId: string }
  | { name: 'game-live'; gameId: string }
  | { name: 'receive'; data: string }
  | { name: 'help'; topic: string | null }
  | { name: 'welcome' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'diagnostics') return { name: 'diagnostics' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'receive' && parts[1]) return { name: 'receive', data: parts[1] };
  if (parts[0] === 'help') return { name: 'help', topic: parts[1] ?? null };
  if (parts[0] === 'welcome') return { name: 'welcome' };
  if (parts[0] === 'team' && parts[1]) return { name: 'team', teamId: parts[1] };
  if (parts[0] === 'game' && parts[1]) {
    if (parts[2] === 'plan') return { name: 'game-plan', gameId: parts[1] };
    if (parts[2] === 'live') return { name: 'game-live', gameId: parts[1] };
    return { name: 'game-setup', gameId: parts[1] };
  }
  return { name: 'teams' };
}

export const paths = {
  teams: () => '#/',
  diagnostics: () => '#/diagnostics',
  settings: () => '#/settings',
  team: (teamId: string) => `#/team/${teamId}`,
  gameSetup: (gameId: string) => `#/game/${gameId}`,
  gamePlan: (gameId: string) => `#/game/${gameId}/plan`,
  gameLive: (gameId: string) => `#/game/${gameId}/live`,
  receive: (data: string) => `#/receive/${data}`,
  help: (topic?: string) => (topic ? `#/help/${topic}` : '#/help'),
  welcome: () => '#/welcome',
};

/** Where a game opens: Setup before there's a plan, the plan before it starts, Game Day (or Final) after. */
export function gamePath(game: Game): string {
  if (game.status !== 'planned') return paths.gameLive(game.id);
  if (game.plan.length > 0) return paths.gamePlan(game.id);
  return paths.gameSetup(game.id);
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

/**
 * How many pages deep this visit is, stamped on each history entry so it is
 * still right after going back. Help's back button uses it to return to the
 * page it was opened from, the way Safari's own back does, and Done to leave
 * help for the screen it was opened from (H-8).
 *
 * Each page also gets its own key. iPhone Safari can carry the previous
 * page's history state over to a new page when only the # part changes, so a
 * page showing the key of the page we were just on is a new page, not an old
 * one we came back to.
 */
let depth = 0;
/** On a help page: the depth of the screen help was opened from, if known. */
let helpFrom: number | null = null;
let currentKey: string | null = null;
let currentHash: string | null = null;

interface Stamp {
  next5Key?: string;
  next5Depth?: number;
  next5HelpFrom?: number | null;
}

/** Reads this page's place in the visit, or stamps it on a page not seen before. */
function stampHistory(opened: boolean): void {
  const hash = window.location.hash;
  // The same page again (e.g. a repeated event): nothing has moved.
  if (!opened && hash === currentHash) return;
  const state = (window.history.state ?? {}) as Stamp;
  const known = typeof state.next5Key === 'string' && typeof state.next5Depth === 'number';
  if (known && (opened || state.next5Key !== currentKey)) {
    // Opened (or reloaded) on a page, or back or forward to one we've been on.
    depth = state.next5Depth!;
    helpFrom = state.next5HelpFrom ?? null;
    currentKey = state.next5Key!;
  } else {
    // A new page: the first if the app just opened, otherwise one deeper.
    const inHelp = parseRoute(hash).name === 'help';
    const from = opened ? null : (helpFrom ?? depth);
    depth = opened ? 0 : depth + 1;
    helpFrom = inHelp ? from : null;
    currentKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.history.replaceState({ ...state, next5Key: currentKey, next5Depth: depth, next5HelpFrom: helpFrom }, '');
  }
  currentHash = hash;
}

/** True when there's an earlier next5 page in this visit to go back to. */
export function canGoBack(): boolean {
  return depth > 0;
}

/** Leaves help for the screen it was opened from. False if that isn't known (e.g. opened from a link). */
export function leaveHelp(): boolean {
  if (helpFrom === null) return false;
  window.history.go(helpFrom - depth);
  return true;
}

/** Where a help page's back button goes when there's no earlier page (e.g. opened from a link). */
export function helpBack(hash: string): string {
  const route = parseRoute(hash);
  return route.name === 'help' && route.topic !== null ? paths.help() : paths.teams();
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    stampHistory(true);
    const onChange = () => {
      stampHistory(false);
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
