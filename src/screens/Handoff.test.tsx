/**
 * Handing a game to the assistant and back through the real screens (SH1–SH6).
 * Each test plays one phone; "the other phone" is simulated by clearing the
 * database or editing the saved game.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { dataFromText, encodeHandoff, makeHandoff, type GameHandoff } from '../data/handoff';
import { createDemoTeam, createGame, saveGame } from '../data/repo';
import type { Game } from '../data/types';
import { nextSegment, planGame, startGame } from '../domain/game';

const sharedLinks: string[] = [];
const sharedFiles: { name: string; text: string }[] = [];
let clipboard = '';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
  localStorage.clear();
  sharedLinks.length = 0;
  sharedFiles.length = 0;
  clipboard = '';
  // Pretend to be an iPhone: links and files go to the share sheet.
  Object.assign(navigator, {
    canShare: () => true,
    share: vi.fn(async ({ url, files }: { url?: string; files?: File[] }) => {
      if (url) sharedLinks.push(url);
      if (files) sharedFiles.push({ name: files[0]!.name, text: await files[0]!.text() });
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

/** userEvent.setup() installs its own clipboard, so ours goes in after it. */
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboard = text;
      },
      readText: async () => clipboard,
    },
  });
  return user;
}

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** A planned demo-team game, saved on this phone. */
async function plannedGame(): Promise<{ game: Game; handoff: () => GameHandoff }> {
  const team = await createDemoTeam();
  const roster = await db.players.toArray();
  const created = await createGame(team);
  const outcome = planGame(created, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  const game = { ...created, opponent: 'Tigers', plan: outcome.plan, warnings: outcome.warnings };
  await saveGame(game);
  const saved = (await db.games.get(game.id))!;
  return { game: saved, handoff: () => makeHandoff(saved, team, roster) };
}

/** Wipes this phone, as if the game were opened on the other one. */
const otherPhone = () => Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
const savedGame = async (id: string) => (await db.games.get(id))!;

describe('coach: send to assistant (SH1, SH5)', () => {
  it('sends a link, shows the game is with the assistant, and notices later edits', async () => {
    const user = setup();
    const { game } = await plannedGame();
    await goTo(`#/game/${game.id}/plan`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Send to assistant' }));
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to your assistant.');
    expect(sharedLinks[0]).toContain('#/receive/z');
    expect((await savedGame(game.id)).handoff).toMatchObject({ n: 1, role: 'coach', away: true });

    // Start is replaced by Send again; the plan can still change.
    expect(screen.getByRole('complementary', { name: 'With your assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 5));
    await user.click(screen.getByRole('button', { name: '↻ Shuffle' }));
    expect(await screen.findByText(/changed the plan since/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send again' }));
    await user.click(screen.getByRole('button', { name: 'AirDrop a file' }));
    await waitFor(() => expect(sharedFiles).toHaveLength(1));
    expect(sharedFiles[0]!.name).toBe(`next5-game-${game.date}-vs-tigers.json`);
    expect(JSON.parse(sharedFiles[0]!.text)).toMatchObject({ format: 'next5-game', n: 2, from: 'coach' });
    await waitFor(() => expect(screen.queryByText(/changed the plan since/)).not.toBeInTheDocument());

    // The team's game list says where the game is.
    await goTo(`#/team/${game.teamId}`);
    expect(await screen.findByText('With assistant')).toBeInTheDocument();
  });

  it('takes back control after confirming', async () => {
    const user = setup();
    const { game } = await plannedGame();
    await saveGame({ ...game, handoff: { n: 1, role: 'coach', away: true, sentAt: Date.now() + 1000 } });
    await goTo(`#/game/${game.id}/plan`);
    render(<App />);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(await screen.findByRole('button', { name: 'Take back control' }));
    expect((await savedGame(game.id)).handoff?.away).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Take back control' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect((await savedGame(game.id)).handoff).toEqual({ n: 2, role: 'coach', away: false });
  });

  it('copies the link where there is no share sheet, and leaves the game alone if sharing is cancelled', async () => {
    const user = setup();
    const { game } = await plannedGame();
    delete (navigator as { share?: unknown }).share;
    await goTo(`#/game/${game.id}/plan`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Send to assistant' }));
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
    expect(dataFromText(clipboard)).toMatch(/^z/);

    Object.assign(navigator, { share: async () => Promise.reject(new DOMException('closed', 'AbortError')) });
    await saveGame({ ...(await savedGame(game.id)), handoff: undefined });
    await user.click(await screen.findByRole('button', { name: 'Send to assistant' }));
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(screen.getByRole('dialog', { name: 'Send to assistant' })).toBeInTheDocument();
    expect((await savedGame(game.id)).handoff).toBeUndefined();
  });

  it('says so when the link can be neither shared nor copied', async () => {
    const user = setup();
    const { game } = await plannedGame();
    Object.assign(navigator, { share: async () => Promise.reject(new Error('no')) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('no')) } });
    await goTo(`#/game/${game.id}/plan`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Send to assistant' }));
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try sending a file instead');
  });
});

describe('opening a game someone sent (SH3, SH4)', () => {
  it('adds the coach’s game on the assistant’s phone and opens the plan', async () => {
    const user = setup();
    const { game, handoff } = await plannedGame();
    const data = await encodeHandoff(handoff());
    await otherPhone();
    await goTo(`#/receive/${data}`);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Game from the coach' })).toBeInTheDocument();
    expect(screen.getByText(/Demo Hoopers · .* · 10 players · Planned/)).toBeInTheDocument();
    // In Safari, the assistant can copy it for the Home Screen app instead.
    await user.click(screen.getByRole('button', { name: 'Copy for the next5 app' }));
    expect(await screen.findByRole('status')).toHaveTextContent('tap Paste game');
    expect(clipboard).toContain(data);

    await user.click(screen.getByRole('button', { name: 'Open here' }));
    expect(await screen.findByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();
    expect((await savedGame(game.id)).handoff).toEqual({ n: 1, role: 'assistant', away: false });
    // The assistant runs the game; there's no "Send to assistant" on their phone.
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to assistant' })).not.toBeInTheDocument();
  });

  it('says when this phone already has the game', async () => {
    const user = setup();
    const { game, handoff } = await plannedGame();
    await saveGame({ ...game, handoff: { n: 5, role: 'assistant', away: false } });
    await goTo(`#/receive/${await encodeHandoff(handoff())}`);
    render(<App />);
    expect(await screen.findByText(/already has this game/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy for the next5 app' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open your copy' }));
    expect(await screen.findByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();
  });

  it('protects a game the assistant has started, with Replace anyway', async () => {
    const user = setup();
    const { game, handoff } = await plannedGame();
    const data = await encodeHandoff({ ...handoff(), n: 2 });
    await saveGame({ ...nextSegment(startGame(game)), handoff: { n: 1, role: 'assistant', away: false } });
    await goTo(`#/receive/${data}`);
    const { unmount } = render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('1 segments played; this copy has 0');
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(await screen.findByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect((await savedGame(game.id)).played).toHaveLength(1);
    unmount();

    await goTo(`#/receive/${data}`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Replace anyway' }));
    expect(await screen.findByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();
    expect((await savedGame(game.id)).status).toBe('planned');
  });

  it('asks which copy to keep when both phones changed the game', async () => {
    const user = setup();
    const { game, handoff } = await plannedGame();
    const fromAssistant = { ...handoff(), n: 2, from: 'assistant' as const, game: { ...handoff().game, updatedAt: game.updatedAt + 50 } };
    await saveGame({ ...game, handoff: { n: 2, role: 'coach', away: false } });
    await goTo(`#/receive/${await encodeHandoff(fromAssistant)}`);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Game from your assistant' })).toBeInTheDocument();
    expect(screen.getByText(/Both phones changed this game/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use this copy' }));
    expect(await screen.findByRole('heading', { name: 'Q1 · 1 of 2' })).toBeInTheDocument();
    expect((await savedGame(game.id)).updatedAt).toBe(game.updatedAt + 50);
  });

  it('explains a damaged link', async () => {
    await goTo('#/receive/zAAAA');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('damaged or cut off');
  });
});

describe('Teams screen: paste or open a game (SH3)', () => {
  it('pastes a link copied from a message', async () => {
    const user = setup();
    const { handoff } = await plannedGame();
    clipboard = `Game tonight! https://example.github.io/next5/#/receive/${await encodeHandoff(handoff())}`;
    await otherPhone();
    await goTo('#/');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Paste game' }));
    expect(await screen.findByRole('heading', { name: 'Game from the coach' })).toBeInTheDocument();
  });

  it('says when the clipboard has no game or can’t be read', async () => {
    const user = setup();
    clipboard = 'hello';
    await goTo('#/');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Paste game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a next5 game link');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.reject(new Error('denied')) } });
    await user.click(screen.getByRole('button', { name: 'Paste game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t read what you copied');
  });

  it('opens a game file from AirDrop, and turns away a backup file', async () => {
    const user = setup();
    const { handoff } = await plannedGame();
    const text = JSON.stringify(handoff());
    await otherPhone();
    await goTo('#/');
    render(<App />);
    const input = await screen.findByLabelText('Game file');
    await user.upload(input, new File([JSON.stringify({ format: 'next5-backup' })], 'b.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This is a backup file');
    await user.upload(input, new File([text], 'g.json', { type: 'application/json' }));
    expect(await screen.findByRole('heading', { name: 'Game from the coach' })).toBeInTheDocument();
  });
});

describe('assistant: send back to coach (SH2)', () => {
  it('offers Send back to coach on the Final screen', async () => {
    const user = setup();
    const { game } = await plannedGame();
    let finished = startGame(game);
    while (finished.status === 'live') finished = nextSegment(finished);
    await saveGame({ ...finished, handoff: { n: 1, role: 'assistant', away: false } });
    await goTo(`#/game/${game.id}/live`);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Send back to coach' }));
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to the coach.');
    expect((await savedGame(game.id)).handoff).toMatchObject({ n: 2, role: 'assistant', away: true });
    expect(screen.getByRole('button', { name: 'Send back again' })).toBeInTheDocument();
  });
});
