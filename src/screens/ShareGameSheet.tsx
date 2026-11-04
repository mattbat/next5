import { useState } from 'react';
import { Sheet } from '../components/ui';
import { encodeHandoff, handoffFileName, handoffLink, makeHandoff } from '../data/handoff';
import { getGame, markSent } from '../data/repo';
import { shareFile, shareLink } from '../data/share';
import type { Game, Player, Team } from '../data/types';
import { segmentLabel } from '../domain/game';

/**
 * Share a game with the other phone at any point (SH1, SH2): as a link for
 * Messages and other chat apps, or as a file for AirDrop and Files.
 */
export function ShareGameSheet({
  game,
  team,
  roster,
  onSent,
  onClose,
}: {
  game: Game;
  team: Team;
  roster: Player[];
  onSent: (message: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  /** Builds the handoff from the latest saved copy, so a just-made change goes too. */
  const build = async () => makeHandoff((await getGame(game.id)) ?? game, team, roster);

  const sendLink = async () => {
    const handoff = await build();
    const url = handoffLink(await encodeHandoff(handoff));
    const title = `next5: ${game.opponent ? `vs ${game.opponent}` : 'game'}`;
    const outcome = await shareLink(url, title, `${title} on ${game.date}. Tap to open it in next5.`);
    if (outcome === 'cancelled') return;
    if (outcome === 'failed') return setError('Couldn’t share or copy the link. Try sending a file instead.');
    await markSent(game.id, handoff.n);
    onSent(outcome === 'copied' ? 'Link copied. Paste it in a message to the other phone.' : 'Game shared.');
  };

  const sendFile = async () => {
    const handoff = await build();
    const outcome = await shareFile(handoffFileName(handoff), JSON.stringify(handoff));
    if (outcome === 'cancelled') return;
    await markSent(game.id, handoff.n);
    onSent(outcome === 'shared' ? 'Game shared.' : 'Game file downloaded. Send it to the other phone.');
  };

  return (
    <Sheet title="Share game" onClose={onClose}>
      <div className="actions">
        <button type="button" className="btn wide" onClick={() => void sendLink()}>
          Text a link
        </button>
        <p className="hint">For Messages, WhatsApp or email, when you’re not together.</p>
        <button type="button" className="btn secondary wide" onClick={() => void sendFile()}>
          AirDrop a file
        </button>
        <p className="hint">When you’re standing together. Works with no signal. Also saves to Files.</p>
      </div>
      <p className="hint">{whatHappens(game)}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function whatHappens(game: Game): string {
  if (game.status === 'planned') {
    return 'You can keep changing the plan and share it again until tip-off. Once the other phone starts the game, it runs there.';
  }
  if (game.status === 'live') {
    return `The other phone takes over from ${segmentLabel(game.format, game.current).text}. This phone stops running the game until you take back control.`;
  }
  return 'Shares the finished game with its playing time, for the other phone’s records.';
}
