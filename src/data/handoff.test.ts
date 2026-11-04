import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { db } from './db';
import {
  dataFromText,
  decideReceive,
  decodeHandoff,
  encodeHandoff,
  handoffFileName,
  handoffLink,
  makeHandoff,
  parseHandoff,
  type GameHandoff,
} from './handoff';
import { addPlayer, changedSinceSent, createDemoTeam, createGame, markSent, receiveGame, saveGame, takeBack, updateGame } from './repo';
import type { Game, Handoff } from './types';
import { nextSegment, planGame, startGame } from '../domain/game';

beforeEach(async () => {
  await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
});

/** A demo team with a planned game, as the coach's phone has it. */
async function plannedGame(extraPlayers = 0) {
  const team = await createDemoTeam();
  for (let i = 0; i < extraPlayers; i++) await addPlayer(team.id, { name: `Extra ${i + 1}`, number: String(40 + i), skills: { G: 2, F: 2 } });
  const created = await createGame(team);
  const roster = await db.players.where('teamId').equals(team.id).toArray();
  const outcome = planGame({ ...created, opponent: 'Tigers', date: '2026-11-08' }, team, roster);
  if (!outcome.ok) throw new Error('plan failed');
  const game: Game = { ...created, opponent: 'Tigers', date: '2026-11-08', plan: outcome.plan, warnings: outcome.warnings };
  await saveGame(game);
  return { team, roster, game: (await db.games.get(game.id))! };
}

/** The game played to the end, saved later than the plan (as the repo would stamp it). */
const finish = (game: Game) => {
  let g = startGame(game);
  while (g.status === 'live') g = nextSegment(g);
  return { ...g, updatedAt: game.updatedAt + 50 };
};

const withHandoff = (game: Game, handoff: Handoff | undefined): Game => ({ ...game, handoff });

describe('makeHandoff', () => {
  it('sends the attending players with the next handoff number, from the coach', async () => {
    const { team, roster, game } = await plannedGame();
    const attending = { ...game, attending: game.attending.slice(1) };
    const handoff = makeHandoff(attending, team, roster);
    expect(handoff).toMatchObject({ format: 'next5-game', version: 1, n: 1, from: 'coach' });
    expect(handoff.players.map((p) => p.id).sort()).toEqual([...attending.attending].sort());
    // Skill levels travel too: the assistant's phone needs them to re-plan.
    expect(handoff.players[0]!.skills).toEqual(roster.find((p) => p.id === handoff.players[0]!.id)!.skills);
    expect(handoff.game).not.toHaveProperty('handoff');
  });

  it('sends back from the assistant with the number raised', async () => {
    const { team, roster, game } = await plannedGame();
    const handoff = makeHandoff(withHandoff(game, { n: 3, role: 'assistant', away: false }), team, roster);
    expect(handoff).toMatchObject({ n: 4, from: 'assistant' });
  });
});

describe('links and files', () => {
  it('round-trips a game through a compressed link and a plain one', async () => {
    const { team, roster, game } = await plannedGame();
    const handoff = makeHandoff(game, team, roster);
    for (const compress of [true, false]) {
      const data = await encodeHandoff(handoff, compress);
      expect(data).toMatch(/^[zj][A-Za-z0-9_-]+$/);
      expect(await decodeHandoff(data)).toEqual({ ok: true, handoff });
    }
  });

  it('keeps a finished 12-player game with swaps small enough for a text message link', async () => {
    const { team, roster, game } = await plannedGame(2);
    const done = finish({ ...game, events: Array.from({ length: 8 }, (_, i) => ({ segment: i, kind: 'swap-now' as const, out: game.attending[0]!, in: game.attending[1]! })) });
    expect(done.status).toBe('final');
    const link = handoffLink(await encodeHandoff(makeHandoff(done, team, roster)), { origin: 'https://example.github.io', pathname: '/next5/' });
    expect(link.length).toBeLessThan(8000);
  });

  it('says when a link is damaged, cut off or not a game', async () => {
    expect(await decodeHandoff('x123')).toMatchObject({ ok: false, message: expect.stringContaining('damaged') });
    expect(await decodeHandoff('z!!!')).toMatchObject({ ok: false, message: expect.stringContaining('damaged') });
    const { team, roster, game } = await plannedGame();
    const data = await encodeHandoff(makeHandoff(game, team, roster));
    expect(await decodeHandoff(data.slice(0, data.length / 2))).toMatchObject({ ok: false });
  });

  it('checks a file before opening it', async () => {
    const { team, roster, game } = await plannedGame();
    const good = makeHandoff(game, team, roster);
    expect(parseHandoff('not json')).toMatchObject({ ok: false, message: expect.stringContaining("can't be read") });
    expect(parseHandoff(JSON.stringify({ format: 'next5-backup' }))).toMatchObject({ ok: false, message: expect.stringContaining('Settings') });
    expect(parseHandoff(JSON.stringify({ format: 'other' }))).toMatchObject({ ok: false, message: "This isn't a next5 game." });
    expect(parseHandoff(JSON.stringify({ ...good, version: 99 }))).toMatchObject({ ok: false, message: expect.stringContaining('newer version') });
    expect(parseHandoff(JSON.stringify({ ...good, from: 'referee' }))).toMatchObject({ ok: false, message: expect.stringContaining('damaged') });
    expect(parseHandoff(JSON.stringify({ ...good, game: { ...good.game, teamId: 'other' } }))).toMatchObject({ ok: false });
  });

  it('brings games from older versions up to date', async () => {
    const { team, roster, game } = await plannedGame();
    const old = makeHandoff(game, team, roster) as unknown as { game: Partial<Game> };
    delete old.game.locks;
    delete old.game.events;
    const parsed = parseHandoff(JSON.stringify(old));
    expect(parsed.ok && parsed.handoff.game).toMatchObject({ locks: [], events: [] });
  });

  it('finds the game in a pasted link or message', () => {
    expect(dataFromText('Here’s the game: https://x.github.io/next5/#/receive/zAbC-_9 see you there')).toBe('zAbC-_9');
    expect(dataFromText('  jAbC  ')).toBe('jAbC');
    expect(dataFromText('hello')).toBeNull();
  });

  it('names the file after the game', async () => {
    const { team, roster, game } = await plannedGame();
    expect(handoffFileName(makeHandoff(game, team, roster))).toBe('next5-game-2026-11-08-vs-tigers.json');
    expect(handoffFileName(makeHandoff({ ...game, opponent: '' }, team, roster))).toBe('next5-game-2026-11-08.json');
  });
});

describe('decideReceive (SH4)', () => {
  let base: Game;
  let send: (from: Game, overrides?: Partial<GameHandoff>) => GameHandoff;
  beforeEach(async () => {
    const { team, roster, game } = await plannedGame();
    base = game;
    send = (from, overrides) => ({ ...makeHandoff(from, team, roster), ...overrides });
  });

  it('adds a game this phone has never seen', () => {
    expect(decideReceive(undefined, send(base))).toEqual({ kind: 'add' });
  });

  it('replaces the assistant’s copy with the coach’s updated plan', () => {
    const assistant = withHandoff(base, { n: 1, role: 'assistant', away: false });
    const coach = withHandoff({ ...base, updatedAt: base.updatedAt + 5 }, { n: 1, role: 'coach', away: true });
    expect(decideReceive(assistant, send(coach))).toEqual({ kind: 'replace' });
  });

  it('ignores the same link opened twice, an older link, and this phone’s own send', () => {
    const received = send(base);
    const assistant = withHandoff(received.game, { n: 1, role: 'assistant', away: false });
    expect(decideReceive(assistant, received)).toEqual({ kind: 'older' });
    expect(decideReceive(withHandoff(base, { n: 3, role: 'assistant', away: false }), send(withHandoff(base, { n: 1, role: 'coach', away: true })))).toEqual({ kind: 'older' });
    const coach = withHandoff({ ...base, updatedAt: base.updatedAt + 9 }, { n: 1, role: 'coach', away: true });
    expect(decideReceive(coach, send(base))).toEqual({ kind: 'older' });
  });

  it('refuses a plan that would wipe out a game the assistant has started', () => {
    const live = nextSegment(startGame(base));
    const assistant = withHandoff(live, { n: 1, role: 'assistant', away: false });
    const coach = withHandoff({ ...base, updatedAt: base.updatedAt + 5 }, { n: 1, role: 'coach', away: true });
    expect(decideReceive(assistant, send(coach))).toEqual({ kind: 'would-lose', localPlayed: 1, incomingPlayed: 0 });
  });

  it('takes the finished game back on the coach’s phone, even after the coach resent the plan', () => {
    const coach = withHandoff(base, { n: 2, role: 'coach', away: true });
    const fromAssistant = send(withHandoff(finish(base), { n: 1, role: 'assistant', away: false }));
    expect(fromAssistant.n).toBe(2);
    expect(decideReceive(coach, fromAssistant)).toEqual({ kind: 'replace' });
  });

  it('asks when both phones changed the game after Take back control', () => {
    const coach = withHandoff({ ...base, updatedAt: base.updatedAt + 1 }, { n: 2, role: 'coach', away: false });
    const fromAssistant = send(withHandoff(finish(base), { n: 1, role: 'assistant', away: false }));
    expect(decideReceive(coach, fromAssistant)).toEqual({ kind: 'tie' });
  });

  it('never quietly replaces a copy with an older one', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.constantFrom('coach' as const, 'assistant' as const),
        fc.constantFrom('coach' as const, 'assistant' as const),
        fc.boolean(),
        (localN, incomingN, role, from, away) => {
          fc.pre(incomingN < localN);
          const local = withHandoff(base, { n: localN, role, away });
          expect(decideReceive(local, send(base, { n: incomingN, from })).kind).toBe('older');
        },
      ),
    );
  });

  it('never quietly drops played segments', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 20 }), (local, incoming, n) => {
        fc.pre(incoming < local);
        let localGame = startGame(base);
        for (let i = 0; i < local; i++) localGame = nextSegment(localGame);
        let incomingGame = startGame(base);
        for (let i = 0; i < incoming; i++) incomingGame = nextSegment(incomingGame);
        const decision = decideReceive(withHandoff(localGame, { n, role: 'assistant', away: false }), send(incomingGame, { n: n + 1, from: 'coach' }));
        expect(decision.kind).toBe('would-lose');
      }),
    );
  });
});

describe('sending and receiving on this phone', () => {
  it('marks a game sent, notices edits after that, and takes it back', async () => {
    const { game } = await plannedGame();
    await markSent(game.id, 1, game.updatedAt + 10);
    let saved = (await db.games.get(game.id))!;
    expect(saved.handoff).toEqual({ n: 1, role: 'coach', away: true, sentAt: game.updatedAt + 10 });
    expect(changedSinceSent(saved)).toBe(false);
    await updateGame(game.id, { seed: 5 });
    saved = (await db.games.get(game.id))!;
    expect(changedSinceSent(saved)).toBe(saved.updatedAt > game.updatedAt + 10);
    await takeBack(game.id);
    expect((await db.games.get(game.id))!.handoff).toEqual({ n: 2, role: 'coach', away: false });
  });

  it('ignores marking or taking back a game that is gone or was never sent', async () => {
    await markSent('missing', 1);
    await takeBack('missing');
    const { game } = await plannedGame();
    await takeBack(game.id);
    expect((await db.games.get(game.id))!.handoff).toBeUndefined();
  });

  it('adds a received game with its team and players to an empty phone, as the assistant', async () => {
    const { team, roster, game } = await plannedGame();
    const handoff = makeHandoff(game, team, roster);
    await Promise.all([db.teams.clear(), db.players.clear(), db.games.clear()]);
    await receiveGame(handoff);
    expect(await db.teams.get(team.id)).toEqual(team);
    expect(await db.players.count()).toBe(handoff.players.length);
    expect(await db.games.get(game.id)).toEqual({ ...handoff.game, handoff: { n: 1, role: 'assistant', away: false } });
  });

  it('keeps this phone’s newer team and player edits when a game comes back', async () => {
    const { team, roster, game } = await plannedGame();
    const handoff = makeHandoff(finish(game), team, roster);
    const renamed = { ...roster[0]!, name: 'Renamed', updatedAt: roster[0]!.updatedAt + 100 };
    await db.players.put(renamed);
    await db.teams.put({ ...team, name: 'New name', updatedAt: team.updatedAt + 100 });
    await receiveGame({ ...handoff, from: 'assistant' });
    expect((await db.players.get(renamed.id))!.name).toBe('Renamed');
    expect((await db.teams.get(team.id))!.name).toBe('New name');
    expect(await db.games.get(game.id)).toMatchObject({ status: 'final', handoff: { role: 'coach', away: false } });
  });
});
