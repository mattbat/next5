import { describe, expect, it } from 'vitest';
import { substitutions } from './substitutions';
import type { Lineup } from './types';

const slots = (pairs: [string, string | null][]): Lineup => pairs.map(([playerId, positionId]) => ({ playerId, positionId }));

describe('substitutions', () => {
  const current = slots([
    ['ava', 'G'],
    ['bo', 'G'],
    ['cy', 'F'],
    ['di', 'F'],
    ['eli', 'C'],
  ]);

  it('pairs each incoming player with an outgoing player at the same position', () => {
    const next = slots([
      ['maya', 'C'],
      ['bo', 'G'],
      ['cy', 'F'],
      ['noa', 'G'],
      ['di', 'F'],
    ]);
    expect(substitutions(current, next).subs).toEqual([
      { in: 'maya', out: 'eli', positionId: 'C' },
      { in: 'noa', out: 'ava', positionId: 'G' },
    ]);
  });

  it('pairs leftovers in order when positions do not match', () => {
    const next = slots([
      ['maya', 'F'],
      ['bo', 'G'],
      ['cy', 'F'],
      ['di', 'F'],
      ['eli', 'C'],
    ]);
    expect(substitutions(current, next).subs).toEqual([{ in: 'maya', out: 'ava', positionId: 'F' }]);
  });

  it('lists players who stay, including position switches', () => {
    const next = slots([
      ['ava', 'G'],
      ['bo', 'F'],
      ['cy', 'F'],
      ['di', 'F'],
      ['eli', 'C'],
    ]);
    const result = substitutions(current, next);
    expect(result.subs).toEqual([]);
    expect(result.stays).toContainEqual({ playerId: 'bo', from: 'G', to: 'F' });
    expect(result.stays).toContainEqual({ playerId: 'ava', from: 'G', to: 'G' });
  });

  it('handles lineups without positions', () => {
    const a = slots([['a', null], ['b', null], ['c', null], ['d', null], ['e', null]]);
    const b = slots([['f', null], ['b', null], ['c', null], ['d', null], ['e', null]]);
    expect(substitutions(a, b).subs).toEqual([{ in: 'f', out: 'a', positionId: null }]);
  });
});
