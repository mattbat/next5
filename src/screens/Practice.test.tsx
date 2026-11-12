/** Practice planning through the real screens (PR1–PR10). */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db } from '../data/db';
import { addStarterDrills, createDemoTeam, createDrill, createPractice, editPractice } from '../data/repo';
import { STARTER_DRILLS } from '../data/starterDrills';
import { paths } from '../router';

const shared: string[] = [];

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear(), db.drills.clear(), db.practices.clear()]);
  localStorage.clear();
  sessionStorage.clear();
  shared.length = 0;
  Object.assign(navigator, {
    share: vi.fn(async ({ text }: { text: string }) => {
      shared.push(text);
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('drill library (PR2, PR3)', () => {
  it('adds the starter drills, then edits, retires and deletes drills', async () => {
    const user = userEvent.setup();
    await goTo(paths.drills());
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Add starter drills' }));
    expect(await screen.findByRole('status')).toHaveTextContent(`Added ${STARTER_DRILLS.length} starter drills`);
    await user.click(screen.getByRole('button', { name: 'Add starter drills' }));
    expect(await screen.findByRole('status')).toHaveTextContent('You already have every starter drill.');

    // Search and filter.
    await user.type(screen.getByRole('searchbox', { name: 'Search drills' }), 'mikan');
    expect(screen.getAllByRole('button', { name: /Mikan drill/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Closeouts/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search drills' }));
    await user.click(within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name: 'Inbounding' }));
    expect(screen.getByRole('button', { name: /Inbounds: box play/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mikan drill/ })).not.toBeInTheDocument();

    // A new drill with a custom tag.
    await user.click(screen.getByRole('button', { name: '+ New drill' }));
    const sheet = screen.getByRole('dialog', { name: 'New drill' });
    await user.type(within(sheet).getByLabelText('Name'), 'Zone press');
    await user.click(within(sheet).getByRole('button', { name: 'Defense' }));
    await user.type(within(sheet).getByLabelText('New tag'), 'Press break');
    await user.click(within(sheet).getByRole('button', { name: 'Add' }));
    await user.type(within(sheet).getByLabelText(/Equipment/), 'Cones\nPinnies');
    await user.click(within(sheet).getByRole('button', { name: 'Add drill' }));
    await waitFor(async () => expect(await db.drills.where('name').equals('Zone press').first()).toMatchObject({
      tags: ['Defense', 'Press break'],
      equipment: ['Cones', 'Pinnies'],
      court: 'half',
    }));

    // Retire it, then bring it back.
    await user.click(within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name: 'Inbounding' }));
    await user.click(await screen.findByRole('button', { name: /Zone press/ }));
    await user.click(screen.getByRole('button', { name: 'Retire' }));
    expect(await screen.findByRole('button', { name: /Show retired drills \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Zone press/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show retired drills/ }));
    await user.click(screen.getByRole('button', { name: /Zone press/ }));
    await user.click(screen.getByRole('button', { name: 'Bring back' }));

    // Delete it.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(await screen.findByRole('button', { name: /Zone press/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await db.drills.where('name').equals('Zone press').count()).toBe(0));
  });

  it('won’t delete a drill a practice uses, and suggests retiring it', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    const drill = await createDrill({ name: 'Closeouts', minutes: 8, court: 'half', tags: [], equipment: [], notes: '' });
    const practice = await createPractice(team);
    await editPractice(practice.id, () => ({
      blocks: [{ id: 'b1', minutes: 8, skipped: false, stations: [{ drillId: drill.id, coach: '', group: 'all', rating: 'down', note: 'Too slow' }] }],
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await goTo(paths.drills());
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Closeouts/ }));
    // Past notes show on the drill (PR8).
    expect(await screen.findByText(/Too slow/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Retire it instead');
    expect(await db.drills.count()).toBe(1);
  });
});

describe('a practice from plan to review (PR1, PR4–PR10)', () => {
  it('plans, shares, runs and reviews a practice, and counts it in season stats', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await addStarterDrills();
    await goTo(paths.team(team.id));
    render(<App />);

    // PR1: the Practice tab.
    await user.click(await screen.findByRole('radio', { name: 'Practice' }));
    expect(await screen.findByText(/No practices yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ New practice' }));
    expect(await screen.findByRole('heading', { name: 'Practice', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attending (10)' })).toBeInTheDocument();

    // PR4: drills, a station at the same time, lengths and order.
    const addDrill = async (name: string) => {
      await user.click(screen.getByRole('button', { name: '+ Add drill' }));
      await user.click(within(screen.getByRole('dialog', { name: 'Add a drill' })).getByRole('button', { name: `Add ${name}` }));
    };
    await addDrill('Dynamic warm-up');
    await addDrill('Closeouts');
    await addDrill('Scrimmage');
    const block = (n: number) => screen.getByRole('listitem', { name: `Block ${n}` });
    await waitFor(() => expect(block(3)).toBeInTheDocument());
    await user.click(within(block(2)).getByRole('button', { name: '+ Station' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Add a station' })).getByRole('button', { name: 'Add Form shooting' }));
    await waitFor(() => expect(within(block(2)).getByText('Form shooting')).toBeInTheDocument());
    expect(screen.getByText('31 of 75 min')).toBeInTheDocument();
    expect(screen.getByText(/Needs the full court/)).toBeInTheDocument();
    await user.click(within(block(1)).getByRole('button', { name: 'More minutes' }));
    expect(await screen.findByText('32 of 75 min')).toBeInTheDocument();
    // Reorder by the drag handle; its arrow keys move a block one place.
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    within(block(3)).getByRole('button', { name: 'Drag Scrimmage to reorder' }).focus();
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(within(block(2)).getByText('Scrimmage')).toBeInTheDocument());
    within(block(2)).getByRole('button', { name: 'Drag Scrimmage to reorder' }).focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(within(block(3)).getByText('Scrimmage')).toBeInTheDocument());

    // PR4a: a target of 25 minutes leaves the scrimmage (ending at 32) highlighted.
    expect(screen.queryByText(/won’t finish on time/)).not.toBeInTheDocument();
    for (let i = 0; i < 10; i++) await user.click(screen.getByRole('button', { name: 'Fewer minutes of practice' }));
    // Ten saves in a row; give them time on a busy test machine.
    expect(await screen.findByText('32 of 25 min', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/7 min past your 25 min\. Highlighted drills won’t finish on time\./)).toBeInTheDocument();
    expect(block(3)).toHaveClass('late');
    expect(within(block(3)).getByText('ends 7 min past your 25 min')).toBeInTheDocument();
    expect(block(2)).not.toHaveClass('late');

    // Coaches and groups for the stations.
    await user.type(within(block(2)).getByLabelText('Coach for Closeouts'), 'Coach Sam');
    await user.type(within(block(2)).getByLabelText('Coach for Form shooting'), 'Coach Lee');
    await user.tab();
    await user.click(within(within(block(2)).getByRole('radiogroup', { name: 'Group for Closeouts' })).getByRole('radio', { name: 'A' }));
    await user.click(within(within(block(2)).getByRole('radiogroup', { name: 'Group for Form shooting' })).getByRole('radio', { name: 'B' }));

    // PR5: balanced teams, and moving a player.
    await user.click(screen.getByRole('button', { name: 'Balanced' }));
    expect(await screen.findByRole('heading', { name: 'Team A (5)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Team B (5)' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^Move .* to team B$/ })[0]!);
    expect(await screen.findByRole('heading', { name: 'Team A (4)' })).toBeInTheDocument();

    // PR6: equipment from the always-bring list and the drills.
    expect(screen.getByText('Whistle')).toBeInTheDocument();
    expect(screen.getByText('Practice pinnies')).toBeInTheDocument();

    // PR10: sharing.
    await user.click(screen.getByRole('button', { name: 'Station card: Coach Sam' }));
    await waitFor(() => expect(shared).toHaveLength(1));
    expect(shared[0]).toContain('Closeouts');
    expect(shared[0]).not.toContain('Form shooting');
    await user.click(screen.getByRole('button', { name: 'One-pager for parents' }));
    await waitFor(() => expect(shared).toHaveLength(2));
    expect(shared[1]).toContain('What we’ll work on:');
    expect(shared[1]).not.toContain('Coach Sam');

    // PR7: run it.
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    expect(await screen.findByRole('heading', { name: 'Block 1 of 3', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent(/^(9:00|8:5\d)$/);
    expect(screen.getByRole('region', { name: 'Up next' })).toHaveTextContent('Closeouts + Form shooting · 8 min');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await user.click(screen.getByRole('button', { name: 'Went well' }));
    expect(screen.getByText(/Won’t finish on time: Scrimmage\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Block 2 of 3', level: 1 })).toBeInTheDocument();

    // PR7a: a wrong tap can be undone.
    await user.click(screen.getByRole('button', { name: '↶ Undo Next' }));
    expect(await screen.findByRole('heading', { name: 'Block 1 of 3', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Block 2 of 3', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Coach Sam · Team A · Half court')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('heading', { name: 'Block 3 of 3', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish practice' }));

    // Finished by mistake: undo from the review goes back to the last drill.
    expect(await screen.findByRole('heading', { name: 'Practice review', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '↶ Undo Finish practice' }));
    expect(await screen.findByRole('heading', { name: 'Block 3 of 3', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish practice' }));

    // PR8: review.
    expect(await screen.findByRole('heading', { name: 'Practice review', level: 1 })).toBeInTheDocument();
    await user.type(screen.getByLabelText('What went well'), 'Great hustle');
    await user.tab();
    await waitFor(async () => expect((await db.practices.toArray())[0]!.wentWell).toBe('Great hustle'));
    const practice = (await db.practices.toArray())[0]!;
    expect(practice.status).toBe('done');
    expect(practice.blocks[0]!.stations[0]!.rating).toBe('up');
    expect(practice.blocks[1]!.skipped).toBe(true);

    // PR9: season stats on the Practice tab.
    await goTo(paths.team(team.id));
    expect(await screen.findByRole('table', { name: 'Time by tag' })).toBeInTheDocument();
    const byDrill = screen.getByRole('table', { name: 'Time by drill' });
    expect(within(byDrill).getByText('Dynamic warm-up')).toBeInTheDocument();
    expect(within(byDrill).getByText('Scrimmage')).toBeInTheDocument();
    expect(within(byDrill).queryByText('Closeouts')).not.toBeInTheDocument();
  });

  it('changes the team’s always-bring list in team Settings (PR6)', async () => {
    const user = userEvent.setup();
    const team = await createDemoTeam();
    await goTo(paths.team(team.id));
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Settings' }));
    const box = screen.getByLabelText('Always bring');
    expect(box).toHaveValue('Basketballs\nBall pump\nWhistle\nPractice pinnies\nWater\nFirst-aid kit');
    await user.clear(box);
    await user.type(box, 'Balls\nCones');
    await user.tab();
    await waitFor(async () => expect((await db.teams.get(team.id))!.alwaysBring).toEqual(['Balls', 'Cones']));
  });

  it('opens a running practice on its timer, and explains one that isn’t running', async () => {
    const team = await createDemoTeam();
    const practice = await createPractice(team);
    await goTo(paths.practiceRun(practice.id));
    render(<App />);
    expect(await screen.findByText('This practice hasn’t started.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the plan' })).toHaveAttribute('href', paths.practice(practice.id));
  });
});
