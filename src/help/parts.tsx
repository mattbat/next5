import { useState, type ReactNode } from 'react';
import { paths } from '../router';
import { SHOT_SIZE, SHOTS, shotUrl, type ShotName } from './shots';

/** Building blocks for the help pages (H-1, H-3). */

function currentTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** A screenshot in the current theme, framed like a phone. Tap to see it larger. */
export function Shot({ name, caption }: { name: ShotName; caption?: ReactNode }) {
  const [large, setLarge] = useState(false);
  return (
    <figure className={`shot ${large ? 'large' : ''}`}>
      <button
        type="button"
        className="shot-btn"
        aria-label={large ? 'Show smaller' : 'Show larger'}
        aria-pressed={large}
        onClick={() => setLarge(!large)}
      >
        <img
          src={shotUrl(name, currentTheme())}
          alt={SHOTS[name]}
          width={SHOT_SIZE.width}
          height={SHOT_SIZE.height}
          loading="lazy"
          decoding="async"
        />
      </button>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Numbered steps. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="help-steps">{children}</ol>;
}

/** A tip or a word of warning, set apart from the text. */
export function Tip({ children, title = 'Tip' }: { children: ReactNode; title?: string }) {
  return (
    <aside className="help-tip">
      <strong>{title}</strong> {children}
    </aside>
  );
}

/** A link to another help topic. */
export function TopicLink({ id, children }: { id: string; children: ReactNode }) {
  return <a href={paths.help(id)}>{children}</a>;
}

/** A small "Help" link from a screen to the topic that explains it. */
export function HelpLink({ topic, children = 'How this works' }: { topic: string; children?: ReactNode }) {
  return (
    <a className="help-link" href={paths.help(topic)}>
      <span aria-hidden>?</span> {children}
    </a>
  );
}
