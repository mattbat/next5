import { useEffect, useState } from 'react';
import { Section, TopBar } from '../components/ui';
import { decideReceive, decodeHandoff, type GameHandoff, type ReceiveDecision } from '../data/handoff';
import { getGame, receiveGame } from '../data/repo';
import type { Game } from '../data/types';
import { formatGameDate, segmentLabel } from '../domain/game';
import { gamePath, navigate, paths } from '../router';
import { isStandalone } from '../viewport';
import { HelpLink } from '../help/parts';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; handoff: GameHandoff; local: Game | undefined; decision: ReceiveDecision };

/** Opening a game someone sent: from a link, a pasted link, or a file (SH3, SH4). */
export function ReceiveScreen({ data }: { data: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const parsed = await decodeHandoff(data);
      if (cancelled) return;
      if (!parsed.ok) return setState({ kind: 'error', message: parsed.message });
      const local = await getGame(parsed.handoff.game.id);
      if (!cancelled) setState({ kind: 'ready', handoff: parsed.handoff, local, decision: decideReceive(local, parsed.handoff) });
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (state.kind === 'loading') return <main className="screen" />;
  if (state.kind === 'error') {
    return (
      <main className="screen">
        <TopBar title="Open game" back={paths.teams()} />
        <p className="error" role="alert">
          {state.message}
        </p>
      </main>
    );
  }

  const { handoff, local, decision } = state;
  const { game, team } = handoff;
  const inApp = isStandalone();

  const keep = async () => {
    await receiveGame(handoff);
    navigate(gamePath(game));
  };
  const openMine = () => local && navigate(gamePath(local));

  const copyForApp = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied('Copied. Now open next5 from your Home Screen and tap Paste game.');
    } catch {
      setCopied('Couldn’t copy. Press and hold the link in your message, tap Copy, then open next5 and tap Paste game.');
    }
  };

  return (
    <main className="screen">
      <TopBar title="Shared game" back={paths.teams()} />
      <Section title={game.opponent ? `vs ${game.opponent}` : 'Game'}>
        <p className="hint">
          {team.name} · {formatGameDate(game.date)} · {handoff.players.length} players · {progress(game)}
        </p>
      </Section>

      {(decision.kind === 'add' || decision.kind === 'replace') && (
        <div className="actions">
          <p>{whatOpening(game, decision.kind === 'replace')}</p>
          <button type="button" className="btn wide big" onClick={() => void keep()}>
            {inApp ? 'Open game' : 'Open here'}
          </button>
        </div>
      )}

      {decision.kind === 'older' && (
        <div className="actions">
          <p>This phone already has this game, or a newer copy of it. Nothing to change.</p>
          <button type="button" className="btn wide" onClick={openMine}>
            Open your copy
          </button>
        </div>
      )}

      {decision.kind === 'would-lose' && (
        <div className="actions">
          <p className="error" role="alert">
            You’ve already started this game. This phone has {decision.localPlayed} segments played; this copy has{' '}
            {decision.incomingPlayed}. Opening it would lose your swaps.
          </p>
          <button type="button" className="btn wide" onClick={openMine}>
            Keep mine
          </button>
          <button type="button" className="btn danger wide" onClick={() => void keep()}>
            Replace anyway
          </button>
        </div>
      )}

      {decision.kind === 'tie' && local && (
        <div className="actions">
          <p>
            Both phones changed this game since it was last sent. Yours: {progress(local)}. This copy: {progress(game)}.
            Which one do you want to keep?
          </p>
          <button type="button" className="btn wide" onClick={() => void keep()}>
            Use this copy
          </button>
          <button type="button" className="btn secondary wide" onClick={openMine}>
            Keep mine
          </button>
        </div>
      )}

      <p className="hint">
        <HelpLink topic="share">How sharing works</HelpLink>
      </p>

      {!inApp && decision.kind !== 'older' && (
        <Section title="Using the next5 app?">
          <p className="hint">
            The next5 app on your Home Screen keeps its own data, separate from Safari. To open the game there, copy it,
            then open next5 and tap Paste game.
          </p>
          <button type="button" className="btn secondary wide" onClick={() => void copyForApp()}>
            Copy for the next5 app
          </button>
          {copied && (
            <p className="notice" role="status">
              {copied}
            </p>
          )}
        </Section>
      )}
    </main>
  );
}

/** What opening the game does, by how far it has got (SH3). */
function whatOpening(game: Game, replacing: boolean): string {
  const yours = replacing ? ' It replaces your copy.' : '';
  if (game.status === 'planned') return `You can run this game on this phone. Share it again whenever the other phone should have it.${yours}`;
  if (game.status === 'live') {
    return `This game is in progress. You take over from ${segmentLabel(game.format, game.current).text}, with every swap so far.${yours}`;
  }
  return `This is the finished game, with its playing time. It counts in this phone’s season stats.${yours}`;
}

/** "Planned", "In progress (Q2 · 1 of 2)" or "Final". */
function progress(game: Game): string {
  if (game.status === 'planned') return game.plan.length > 0 ? 'Planned' : 'Not planned yet';
  if (game.status === 'final') return 'Final';
  return `In progress (${segmentLabel(game.format, game.current).text})`;
}
