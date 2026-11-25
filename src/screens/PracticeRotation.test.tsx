/** Rotating stations through the real screens (PR4b). */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { createDemoTeam, createDrill, createPractice, editPractice } from '../data/repo';
import type { Practice } from '../data/types';
import { beep } from '../practiceSound';
import { paths } from '../router';
import { PracticeRunScreen } from './PracticeRunScreen';

vi.mock('../practiceSound', () => ({ beep: vi.fn(), unlock: vi.fn(), soundOn: () => true, setSoundOn: vi.fn() }));

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear(), db.drills.clear(), db.practices.clear()]);
  localStorage.clear();
  vi.mocked(beep).mockClear();
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** A practice with one 12-minute block of Post work (team A) and Guard work (team B). */
async function setUp(changes: Partial<Practice> = {}) {
  const team = await createDemoTeam();
  const fields = { minutes: 12, court: 'half' as const, tags: [], equipment: [], notes: '' };
  const post = await createDrill({ ...fields, name: 'Post work' });
  const guard = await createDrill({ ...fields, name: 'Guard work' });
  const practice = await createPractice(team);
  await editPractice(practice.id, (p) => ({
    teams: { A: p.attending.slice(0, 5), B: p.attending.slice(5) },
    blocks: [
      {
        id: 'b1',
        minutes: 12,
        skipped: false,
        stations: [
          { drillId: post.id, coach: 'Coach Sam', group: 'A' },
          { drillId: guard.id, coach: 'Coach Lee', group: 'B' },
        ],
      },
    ],
    ...changes,
  }));
  return practice.id;
}

describe('rotating stations (PR4b)', () => {
  it('switches a block between parallel and rotate', async () => {
    const user = userEvent.setup();
    const id = await setUp();
    await goTo(paths.practice(id));
    render(<App />);
    const block = await screen.findByRole('listitem', { name: 'Block 1' });
    const mode = within(block).getByRole('radiogroup', { name: 'How the stations run' });
    expect(within(mode).getByRole('radio', { name: 'Parallel' })).toBeChecked();
    expect(within(block).queryByText(/Groups move to the next station/)).not.toBeInTheDocument();
    await user.click(within(mode).getByRole('radio', { name: 'Rotate' }));
    expect(await within(block).findByText(/Groups move to the next station every 6:00/)).toBeInTheDocument();
    expect(within(block).getByText(/Rotate every 6:00/)).toBeInTheDocument();
    await waitFor(async () => expect((await db.practices.get(id))!.blocks[0]!.rotate).toBe(true));
  });

  it('counts down to each rotation, moves the groups and beeps to rotate', async () => {
    const user = userEvent.setup();
    const id = await setUp({ status: 'live', current: 0, clock: { startedAt: 0, elapsed: 0 } });
    await editPractice(id, (p) => ({ blocks: p.blocks.map((b) => ({ ...b, rotate: true })) }));
    let t = 60_000;
    render(<PracticeRunScreen practiceId={id} now={() => t} />);
    expect(await screen.findByText('Rotation 1 of 2 · rotate in 5:00')).toBeInTheDocument();
    expect(screen.getByText('Coach Sam · Team A · Half court')).toBeInTheDocument();
    expect(beep).not.toHaveBeenCalled();

    // Six minutes in: the groups swap, with two beeps.
    t = 6 * 60_000 + 1000;
    expect(await screen.findByText('Rotation 2 of 2 · last one')).toBeInTheDocument();
    expect(screen.getByText('Coach Sam · Team B · Half court')).toBeInTheDocument();
    expect(screen.getByText('Coach Lee · Team A · Half court')).toBeInTheDocument();
    expect(beep).toHaveBeenCalledWith(2);
    expect(beep).toHaveBeenCalledTimes(1);

    // +1 min goes to this rotation only.
    await user.click(screen.getByRole('button', { name: '+1 min' }));
    await waitFor(async () => expect((await db.practices.get(id))!.blocks[0]).toMatchObject({ minutes: 13, added: [0, 1] }));
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent(/^6:5\d$/));
  });

  it('runs parallel stations for the whole block without rotating', async () => {
    const id = await setUp({ status: 'live', current: 0, clock: { startedAt: 0, elapsed: 0 } });
    let t = 0;
    render(<PracticeRunScreen practiceId={id} now={() => t} />);
    expect(await screen.findByText('Coach Sam · Team A · Half court')).toBeInTheDocument();
    t = 6 * 60_000 + 1000;
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('5:59'));
    expect(screen.queryByText(/Rotation/)).not.toBeInTheDocument();
    expect(screen.getByText('Coach Sam · Team A · Half court')).toBeInTheDocument();
    expect(beep).not.toHaveBeenCalled();
  });
});
