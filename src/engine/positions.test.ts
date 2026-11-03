import { describe, expect, it } from 'vitest';
import { assignPositions, canCover, missingPositions, requiredSlots } from './positions';
import { makePlayers } from './testUtils';

describe('requiredSlots', () => {
  it('expands a requirement into one slot per required player', () => {
    expect(requiredSlots({ G: 2, C: 1 })).toEqual(['G', 'G', 'C']);
    expect(requiredSlots({})).toEqual([]);
    expect(requiredSlots({ G: 0 })).toEqual([]);
  });
});

describe('canCover', () => {
  it('is always true with no requirement', () => {
    expect(canCover([], [])).toBe(true);
  });

  it('needs enough eligible players for each slot', () => {
    const players = makePlayers(5, (i) => (i < 2 ? { G: 2 } : { F: 2 }));
    expect(canCover(players, ['G', 'G'])).toBe(true);
    expect(canCover(players, ['G', 'G', 'G'])).toBe(false);
  });

  it('counts each player toward only one position', () => {
    // One player who can play Guard or Center can't cover both at once.
    const players = makePlayers(5, (i) => (i === 0 ? { G: 2, C: 2 } : { F: 2 }));
    expect(canCover(players, ['G'])).toBe(true);
    expect(canCover(players, ['C'])).toBe(true);
    expect(canCover(players, ['G', 'C'])).toBe(false);
  });

  it('finds an assignment that needs reshuffling', () => {
    // p1: G or C, p2: G only. Greedy p1→G fails; matching moves p1 to C.
    const players = makePlayers(2, (i) => (i === 0 ? { G: 2, C: 2 } : { G: 2 }));
    expect(canCover(players, ['G', 'C'])).toBe(true);
  });

  it('is false when there are fewer players than slots', () => {
    expect(canCover(makePlayers(1), ['G', 'F'])).toBe(false);
  });
});

describe('missingPositions', () => {
  it('names positions without enough eligible players', () => {
    const players = makePlayers(6, () => ({ G: 2, F: 2 }));
    expect(missingPositions(players, { G: 2, C: 1 })).toEqual(['C']);
  });

  it('names all required positions when they only conflict together', () => {
    const players = makePlayers(6, (i) => (i === 0 ? { G: 2, C: 2 } : { F: 2 }));
    expect(missingPositions(players, { G: 1, C: 1 })).toEqual(['G', 'C']);
  });
});

describe('assignPositions', () => {
  it('fills required slots with eligible, distinct players', () => {
    const players = makePlayers(5, (i) => (i === 4 ? { C: 2 } : { G: 2, F: 2 }));
    const lineup = assignPositions(players, ['G', 'G', 'C'])!;
    expect(lineup.find((s) => s.playerId === 'p5')!.positionId).toBe('C');
    expect(lineup.filter((s) => s.positionId === 'G').length).toBeGreaterThanOrEqual(2);
  });

  it('prefers higher skill for required slots', () => {
    const players = makePlayers(5, (i) => (i === 3 ? { G: 3 } : { G: 1, F: 2 }));
    const lineup = assignPositions(players, ['G'])!;
    expect(lineup.find((s) => s.positionId === 'G')!.playerId).toBe('p4');
  });

  it('gives unrequired players their best position', () => {
    const players = makePlayers(5, (i) => (i === 0 ? { G: 1, F: 3 } : { G: 2 }));
    const lineup = assignPositions(players, [])!;
    expect(lineup[0]).toEqual({ playerId: 'p1', positionId: 'F' });
  });

  it('shows no position for a player with none', () => {
    const players = makePlayers(5, () => ({}));
    expect(assignPositions(players, [])!.every((s) => s.positionId === null)).toBe(true);
  });

  it('returns null when the requirement cannot be met', () => {
    expect(assignPositions(makePlayers(5, () => ({ G: 2 })), ['C'])).toBeNull();
  });
});
