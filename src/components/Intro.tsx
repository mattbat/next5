import { useRef, useState, type ReactNode } from 'react';
import { createDemoTeam } from '../data/repo';
import { markIntroSeen } from '../help/intro';
import { SHOT_SIZE, SHOTS, shotUrl, type ShotName } from '../help/shots';
import { navigate, paths } from '../router';

interface Card {
  title: string;
  text: ReactNode;
  shot?: ShotName;
}

const CARDS: Card[] = [
  {
    title: 'Fair subs, one tap at a time',
    text: (
      <>
        next5 plans a rotation where every player gets fair playing time and your positions are always covered. On game
        day it tells you who goes in and who comes out.
      </>
    ),
  },
  {
    title: 'Set up your roster once',
    text: (
      <>
        Add each player with the positions they can play and how comfortable they are there. Skill levels stay private:
        they never show on game day.
      </>
    ),
    shot: 'player',
  },
  {
    title: 'A plan in a second',
    text: (
      <>
        Before each game, uncheck anyone who isn’t coming and tap <b>Generate plan</b>. Step through each segment to
        see who plays where.
      </>
    ),
    shot: 'plan',
  },
  {
    title: 'You’re the coach',
    text: (
      <>
        Tap any player to swap them or lock them in or out. The rest of the plan adjusts to keep it fair, and{' '}
        <b>Undo</b> is always there.
      </>
    ),
    shot: 'plan-player',
  },
  {
    title: 'Game day: tap Next',
    text: (
      <>
        Green <b>▲</b> players go in, red <b>▼</b> come out. Injury or late arrival? Tap the player and next5 re-plans the
        rest of the game.
      </>
    ),
    shot: 'gameday',
  },
  {
    title: 'Your team stays on your phone',
    text: (
      <>
        No account, no internet needed. Back up now and then from <b>Settings</b>, and share a game with an assistant’s
        phone whenever you like.
      </>
    ),
  },
];

function theme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * The first-run walkthrough (H-3): a few skippable cards on what next5 does,
 * ending with the demo team or the coach's own. Also replayable from Help.
 */
export function Intro({ onClose, offerDemo }: { onClose: () => void; offerDemo: boolean }) {
  const [at, setAt] = useState(0);
  const touchX = useRef<number | null>(null);
  const card = CARDS[at]!;
  const last = at === CARDS.length - 1;

  const finish = () => {
    markIntroSeen();
    onClose();
  };
  const go = (index: number) => setAt(Math.max(0, Math.min(CARDS.length - 1, index)));

  return (
    <main
      className="screen intro"
      aria-label="Welcome to next5"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50) return;
        go(end < start ? at + 1 : at - 1);
      }}
    >
      <div className="intro-top">
        <span className="brand">
          next<span>5</span>
        </span>
        {!last && (
          <button type="button" className="link" onClick={finish}>
            Skip
          </button>
        )}
      </div>

      <section className="intro-card" aria-live="polite" aria-label={`${at + 1} of ${CARDS.length}`}>
        {card.shot ? (
          <img
            className="intro-shot"
            src={shotUrl(card.shot, theme())}
            alt={SHOTS[card.shot]}
            width={SHOT_SIZE.width}
            height={SHOT_SIZE.height}
          />
        ) : (
          <div className="intro-hero" aria-hidden>
            {at === 0 ? (
              <img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="" width={96} height={96} />
            ) : (
              <span>📱</span>
            )}
          </div>
        )}
        <h1 className="intro-title">{card.title}</h1>
        <p className="intro-text">{card.text}</p>
      </section>

      <div className="intro-dots" aria-hidden>
        {CARDS.map((_, i) => (
          <span key={i} className={i === at ? 'on' : ''} />
        ))}
      </div>

      <footer className="intro-footer">
        {last ? (
          <div className="actions">
            {offerDemo && (
              <button
                type="button"
                className="btn wide big"
                onClick={() => {
                  markIntroSeen();
                  void createDemoTeam().then((t) => navigate(paths.team(t.id)));
                }}
              >
                Try the demo team
              </button>
            )}
            <button type="button" className={`btn wide ${offerDemo ? 'secondary' : 'big'}`} onClick={finish}>
              {offerDemo ? 'Set up my own team' : 'Done'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                markIntroSeen();
                navigate(paths.help('start'));
              }}
            >
              Read the full guide
            </button>
          </div>
        ) : (
          <div className="footer-row">
            <button type="button" className="btn secondary" disabled={at === 0} onClick={() => go(at - 1)}>
              Back
            </button>
            <button type="button" className="btn big grow" onClick={() => go(at + 1)}>
              Next
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}
