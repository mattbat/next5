import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, DEFAULT_RULES } from '../data/defaults';
import type { Game, Player, Team } from '../data/types';
import { formatGameDate } from './game';
import { planText } from './planText';

const team: Team = {
  id: 't',
  name: '8U Thunder',
  positions: DEFAULT_POSITIONS,
  requirement: { G: 2 },
  defaultFormat: { periodType: 'halves', segmentsPerPeriod: 1 },
  defaultRules: DEFAULT_RULES,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
};

const names = ['Zoe', 'Ava', 'Maya', 'Lena', 'Rae', 'Ivy'];
const roster: Player[] = names.map((name, i) => ({
  id: `p${i}`,
  teamId: 't',
  name,
  number: i === 5 ? '' : String(i + 10),
  skills: { G: 3, F: 1 },
  active: true,
  createdAt: 0,
  updatedAt: 0,
}));

const lineup = (ids: number[]) => ids.map((i) => ({ playerId: `p${i}`, positionId: i < 2 ? 'G' : 'F' }));

const game: Game = {
  id: 'g',
  teamId: 't',
  date: '2026-11-07',
  opponent: 'Tigers',
  attending: roster.map((p) => p.id),
  format: { periodType: 'halves', segmentsPerPeriod: 1 },
  rules: DEFAULT_RULES,
  plan: [lineup([0, 1, 2, 3, 4]), lineup([0, 1, 2, 3, 5])],
  warnings: [],
  seed: 1,
  status: 'live',
  current: 1,
  played: [lineup([0, 1, 2, 3, 4])],
  subbedOut: [],
  statuses: {},
  events: [],
  locks: [],
  createdAt: 0,
  updatedAt: 0,
};

describe('planText (E2)', () => {
  it('lists each lineup in display order, with numbers and positions, then totals', () => {
    expect(planText(game, team, roster).split('\n')).toEqual([
      `8U Thunder: vs Tigers · ${formatGameDate('2026-11-07')}`,
      '',
      'H1 (played): #11 Ava G, #10 Zoe G, #13 Lena F, #12 Maya F, #14 Rae F',
      'H2: #11 Ava G, #10 Zoe G, Ivy F, #13 Lena F, #12 Maya F',
      '',
      'Segments each: Ava 2, Ivy 1, Lena 2, Maya 2, Rae 1, Zoe 2',
      '',
    ]);
  });

  it('never includes skill levels', () => {
    const text = planText(game, team, roster);
    expect(text).not.toMatch(/Go-To|Rising|Steady/);
  });
});

describe('formatGameDate (D4)', () => {
  it('shows the day, and leaves anything that isn’t a date alone', () => {
    expect(formatGameDate('2026-11-07')).toMatch(/Nov/);
    expect(formatGameDate('2026-11-07')).toMatch(/7/);
    expect(formatGameDate('')).toBe('');
    expect(formatGameDate('soon')).toBe('soon');
  });
});
