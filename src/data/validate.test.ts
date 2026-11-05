import { beforeEach, describe, expect, it } from 'vitest';
import { generatePlan, requiredSlots } from '../engine';
import { BACKUP_FORMAT, createBackup, parseBackup } from './backup';
import { db } from './db';
import { makeHandoff, parseHandoff } from './handoff';
import { createDemoTeam, createGame } from './repo';
import type { Game } from './types';
import { isValidGame, isValidPlayer, isValidTeam } from './validate';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
});

async function demo() {
  const team = await createDemoTeam();
  const game = await createGame(team);
  const players = await db.players.toArray();
  return { team, game, players };
}

describe('shape checks for incoming data (C4)', () => {
  it('accepts what the app itself saves', async () => {
    const { team, game, players } = await demo();
    expect(isValidTeam(team)).toBe(true);
    expect(players.every(isValidPlayer)).toBe(true);
    expect(isValidGame(game)).toBe(true);
    const live: Game = {
      ...game,
      status: 'live',
      plan: [[{ playerId: players[0]!.id, positionId: null }]],
      statuses: { a: { kind: 'out', from: 1 }, b: { kind: 'resting', from: 1, until: 3 }, c: { kind: 'arrived', at: 2 } },
      locks: [{ segment: 0, playerId: 'a', kind: 'in' }],
      events: [{ kind: 'swap-now', segment: 0, out: 'a', in: 'b' }],
      handoff: { n: 2, role: 'coach', away: true, sentAt: 5 },
    };
    expect(isValidGame(live)).toBe(true);
  });

  it('turns away teams with impossible settings', async () => {
    const { team } = await demo();
    expect(isValidTeam({ ...team, requirement: { G: 1e9 } })).toBe(false);
    expect(isValidTeam({ ...team, requirement: { G: -1 } })).toBe(false);
    expect(isValidTeam({ ...team, defaultFormat: { periodType: 'quarters', segmentsPerPeriod: 1000 } })).toBe(false);
    expect(isValidTeam({ ...team, defaultFormat: { periodType: 'thirds', segmentsPerPeriod: 2 } })).toBe(false);
    expect(isValidTeam({ ...team, positions: 'G' })).toBe(false);
    expect(isValidTeam({ ...team, defaultRules: { equalTime: 'yes' } })).toBe(false);
    expect(isValidTeam({ name: 'No id' })).toBe(false);
  });

  it('turns away players with unknown skill levels', async () => {
    const { players } = await demo();
    expect(isValidPlayer({ ...players[0], skills: { G: 7 } })).toBe(false);
    expect(isValidPlayer({ ...players[0], name: 42 })).toBe(false);
  });

  it('turns away games that would break a screen', async () => {
    const { game } = await demo();
    const bad: unknown[] = [
      { ...game, plan: 'everyone plays' },
      { ...game, plan: [[{ playerId: 1 }]] },
      { ...game, plan: Array.from({ length: 1000 }, () => []) },
      { ...game, status: 'paused' },
      { ...game, status: 'live', plan: [], current: 3 },
      { ...game, statuses: { a: { kind: 'sleeping' } } },
      { ...game, locks: [{ segment: -1, playerId: 'a', kind: 'in' }] },
      { ...game, attending: [1, 2] },
      { ...game, format: { periodType: 'halves', segmentsPerPeriod: 0 } },
      { ...game, handoff: { n: 1, role: 'referee', away: false } },
      [game],
    ];
    for (const value of bad) expect(isValidGame(value)).toBe(false);
  });

  it('accepts a bare game from an early backup, which the database upgrade fills in', () => {
    expect(isValidGame({ id: 'g', played: [] })).toBe(true);
  });

  it('a damaged backup changes nothing and says so', async () => {
    await demo();
    const backup = await createBackup();
    const broken = { ...backup, teams: backup.teams.map((t) => ({ ...t, requirement: { G: 1e9 } })) };
    expect(parseBackup(JSON.stringify(broken))).toEqual({ ok: false, message: expect.stringMatching(/damaged/) });
    const badGame = { ...backup, games: [{ ...backup.games[0], plan: [['x']] }] };
    expect(parseBackup(JSON.stringify(badGame))).toEqual({ ok: false, message: expect.stringMatching(/damaged/) });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, teams: [], players: [], games: [] })).ok).toBe(true);
  });

  it('a damaged shared game is turned away', async () => {
    const { team, game, players } = await demo();
    const handoff = makeHandoff(game, team, players);
    expect(parseHandoff(JSON.stringify(handoff)).ok).toBe(true);
    const crafted = { ...handoff, team: { ...team, requirement: { G: 1e9 } } };
    expect(parseHandoff(JSON.stringify(crafted))).toEqual({ ok: false, message: expect.stringMatching(/damaged/) });
    const badPlayer = { ...handoff, players: [{ ...players[0], skills: { G: 'Go-To' } }] };
    expect(parseHandoff(JSON.stringify(badPlayer)).ok).toBe(false);
  });
});

describe('requirement cap in the engine', () => {
  it('caps a huge requirement instead of looping, and still reports it as too large', () => {
    expect(requiredSlots({ G: 1e9 })).toHaveLength(6);
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, skills: { G: 2 as const } }));
    const result = generatePlan({
      players,
      segmentCount: 2,
      requirement: { G: 1e9 },
      rules: { positionCoverage: true, equalTime: true, limitBench: true, balanceSkill: false },
    });
    expect(result).toEqual({ ok: false, error: { kind: 'requirement-too-large', total: 6 } });
  });
});
