/**
 * The in-app guide and the first-run intro (H-1, H-3, H-4).
 */
import { existsSync } from 'node:fs';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { createDemoTeam } from '../data/repo';
import { INTRO_KEY, introSeen } from '../help/intro';
import { SHOTS } from '../help/shots';
import { GROUPS, TOPICS } from '../help/topics';
import { helpBack, noteHelpOrigin, parseRoute, paths } from '../router';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
  document.documentElement.dataset.theme = 'dark';
  window.location.hash = '#/';
});

async function goTo(hash: string) {
  const oldURL = window.location.href;
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
  });
}

describe('help routes', () => {
  it('parses the help index, a topic and the intro', () => {
    expect(parseRoute('#/help')).toEqual({ name: 'help', topic: null });
    expect(parseRoute('#/help/plan')).toEqual({ name: 'help', topic: 'plan' });
    expect(parseRoute('#/welcome')).toEqual({ name: 'welcome' });
  });

  it('goes back to the screen help was opened from', () => {
    // Opened as a topic from a screen: back returns to that screen, from the topic and from the index.
    noteHelpOrigin('#/game/g1/plan', '#/help/edit-plan');
    expect(helpBack('#/help/edit-plan')).toBe('#/game/g1/plan');
    noteHelpOrigin('#/help/edit-plan', '#/help');
    expect(helpBack('#/help')).toBe('#/game/g1/plan');
    // Another topic opened from the index goes back to the index.
    noteHelpOrigin('#/help', '#/help/rules');
    expect(helpBack('#/help/rules')).toBe('#/help');
    // Opened from Settings at the index.
    noteHelpOrigin('#/settings', '#/help');
    expect(helpBack('#/help')).toBe('#/settings');
    expect(helpBack('#/help/plan')).toBe('#/help');
  });
});

describe('first-run intro (H-3)', () => {
  it('shows on first open, steps through the cards, and starts the demo team', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Fair subs, one tap at a time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Set up your roster once' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: SHOTS.player })).toHaveAttribute('src', expect.stringMatching(/help\/player-dark\.webp$/));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Fair subs, one tap at a time' })).toBeInTheDocument();
    for (let i = 0; i < 5; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Your team stays on your phone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try the demo team' }));
    await goTo(window.location.hash);
    expect(await screen.findByRole('heading', { name: 'Demo Hoopers' })).toBeInTheDocument();
    expect(introSeen()).toBe(true);
  });

  it('can be skipped, and doesn’t come back', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('button', { name: 'Load demo team' })).toBeInTheDocument();
    expect(localStorage.getItem(INTRO_KEY)).toBe('1');
    unmount();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Load demo team' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });

  it('swipes between cards and ends with your own team or the guide', async () => {
    const user = userEvent.setup();
    render(<App />);
    const intro = await screen.findByRole('main', { name: 'Welcome to next5' });
    const swipe = (from: number, to: number) => {
      fireEvent.touchStart(intro, { touches: [{ clientX: from }] });
      fireEvent.touchEnd(intro, { changedTouches: [{ clientX: to }] });
    };
    swipe(300, 100);
    expect(screen.getByRole('heading', { name: 'Set up your roster once' })).toBeInTheDocument();
    swipe(100, 300);
    expect(screen.getByRole('heading', { name: 'Fair subs, one tap at a time' })).toBeInTheDocument();
    swipe(100, 120); // too short to count
    expect(screen.getByRole('heading', { name: 'Fair subs, one tap at a time' })).toBeInTheDocument();
    for (let i = 0; i < 6; i++) swipe(300, 100);
    await user.click(screen.getByRole('button', { name: 'Set up my own team' }));
    expect(await screen.findByLabelText('New team name')).toBeInTheDocument();
  });

  it('isn’t shown to a coach who already has teams', async () => {
    await createDemoTeam();
    render(<App />);
    expect(await screen.findByRole('link', { name: /Demo Hoopers/ })).toBeInTheDocument();
    expect(screen.queryByRole('main', { name: 'Welcome to next5' })).not.toBeInTheDocument();
  });

  it('can be replayed from Help, without adding another demo team', async () => {
    const user = userEvent.setup();
    await createDemoTeam();
    await goTo(paths.help());
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'Replay the intro' }));
    await goTo(window.location.hash);
    for (let i = 0; i < 5; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('button', { name: 'Try the demo team' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Read the full guide' }));
    expect(window.location.hash).toBe('#/help/start');
  });
});

describe('help guide', () => {
  it('lists every topic under its group, opened from the Teams screen and Settings', async () => {
    localStorage.setItem(INTRO_KEY, '1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'Help' }));
    expect(window.location.hash).toBe('#/help');
    await goTo(window.location.hash);
    for (const group of GROUPS) expect(screen.getByRole('heading', { name: group })).toBeInTheDocument();
    for (const topic of TOPICS) {
      const link = screen.getByText(topic.summary).closest('a');
      expect(link).toHaveAttribute('href', paths.help(topic.id));
      expect(link).toHaveTextContent(topic.title);
    }
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '#/');

    await goTo(paths.settings());
    expect(screen.getByRole('link', { name: 'Help and guide' })).toHaveAttribute('href', '#/help');
  });

  it('renders every topic, with working links between topics and pictures for each theme', async () => {
    render(<App />);
    const ids = new Set(TOPICS.map((t) => t.id));
    for (const [i, topic] of TOPICS.entries()) {
      await goTo(paths.help(topic.id));
      const page = screen.getByRole('article');
      expect(within(page).getByRole('heading', { level: 1, name: topic.title })).toBeInTheDocument();
      // Links inside a topic point at topics that exist.
      for (const link of within(page).queryAllByRole('link')) {
        const target = parseRoute(link.getAttribute('href') ?? '');
        expect(target.name).toBe('help');
        if (target.name === 'help') expect(ids.has(target.topic ?? '')).toBe(true);
      }
      const pager = screen.getByRole('navigation', { name: 'More help' });
      if (i > 0) expect(within(pager).getByRole('link', { name: new RegExp(TOPICS[i - 1]!.title) })).toBeInTheDocument();
      if (i < TOPICS.length - 1) expect(within(pager).getByRole('link', { name: new RegExp(TOPICS[i + 1]!.title) })).toBeInTheDocument();
    }
  });

  it('uses only screenshots that exist, in both themes', async () => {
    render(<App />);
    const used = new Set<string>();
    for (const theme of ['dark', 'light'] as const) {
      document.documentElement.dataset.theme = theme;
      for (const topic of TOPICS) {
        await goTo(paths.help(topic.id));
        for (const img of within(screen.getByRole('article')).queryAllByRole('img')) {
          const src = img.getAttribute('src')!;
          expect(src).toMatch(new RegExp(`-${theme}\\.webp$`));
          used.add(src);
        }
      }
    }
    expect(used.size).toBeGreaterThan(10);
    for (const name of Object.keys(SHOTS)) {
      for (const theme of ['dark', 'light']) expect(existsSync(`public/help/${name}-${theme}.webp`), `${name}-${theme}`).toBe(true);
    }
  });

  it('shows a picture larger when tapped', async () => {
    const user = userEvent.setup();
    await goTo(paths.help('plan'));
    render(<App />);
    const [first] = screen.getAllByRole('button', { name: 'Show larger' });
    await user.click(first!);
    expect(screen.getByRole('button', { name: 'Show smaller' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains a help page that doesn’t exist', async () => {
    await goTo(paths.help('nope'));
    render(<App />);
    expect(screen.getByText(/That help page doesn’t exist/)).toBeInTheDocument();
  });
});
