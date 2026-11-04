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
 * Where Help was opened from, so its back button returns there: the screen
 * before the first help page, and that first page (often a topic opened from
 * a "Help" link on a screen).
 */
let helpOrigin: { from: string; entry: string } | null = null;

const isHelp = (hash: string) => parseRoute(hash).name === 'help';
const hashOf = (url: string) => {
  const i = url.indexOf('#');
  return i === -1 ? '' : url.slice(i);
};

/** Remembers the screen Help was opened from. Called on every route change. */
export function noteHelpOrigin(oldHash: string, newHash: string): void {
  if (isHelp(newHash) && !isHelp(oldHash)) helpOrigin = { from: oldHash || paths.teams(), entry: newHash };
}

/** Where a help page's back button goes: the screen it was opened from, or the list of topics. */
export function helpBack(hash: string): string {
  const route = parseRoute(hash);
  const atIndex = route.name === 'help' && route.topic === null;
  if (helpOrigin && (atIndex || hash === helpOrigin.entry)) return helpOrigin.from;
  return atIndex ? paths.teams() : paths.help();
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = (e: HashChangeEvent) => {
      noteHelpOrigin(hashOf(e.oldURL ?? ''), window.location.hash);
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
