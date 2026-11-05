import { useState, type ReactNode } from 'react';
import type { Position } from '../data/types';
import { canGoBack } from '../router';

/** Small shared building blocks used across screens. */

export function TopBar({
  title,
  back,
  historyBack = false,
  lead,
  action,
}: {
  title: ReactNode;
  back?: string;
  /** Back returns to the previous page, like Safari's back; `back` is used when there isn't one. */
  historyBack?: boolean;
  /** Shown on the left when there's no back button. */
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="topbar">
      {back ? (
        <a
          className="topbar-back"
          href={back}
          aria-label="Back"
          onClick={(e) => {
            if (!historyBack || !canGoBack()) return;
            e.preventDefault();
            window.history.back();
          }}
        >
          ‹
        </a>
      ) : (
        <span className="topbar-spacer">{lead}</span>
      )}
      <h1 className="topbar-title">{title}</h1>
      <span className="topbar-action">{action}</span>
    </header>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** An ⓘ button that reveals a one- or two-sentence explanation (H-4). */
export function Info({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="info-btn"
        aria-label={`About ${label}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
      >
        ⓘ
      </button>
      {open && <p className="info-text">{children}</p>}
    </>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  info,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  info?: ReactNode;
}) {
  return (
    <div className="row toggle-row">
      <label className="toggle-label">
        <span>{label}</span>
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch" aria-hidden />
      </label>
      {info && <Info label={label}>{info}</Info>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** A bottom sheet (iOS style) for editing without leaving the screen. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="link" onClick={onClose}>
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Jersey({ number }: { number: string }) {
  return <span className="jersey">{number || '–'}</span>;
}

/**
 * A position as a small letter box, e.g. "G", used wherever a position is
 * shown on its own (D1). VoiceOver reads the full name. Sentences, such as
 * warnings, spell positions out instead.
 */
export function PositionChip({
  id,
  positions,
  tone,
}: {
  id: string | null;
  positions: Position[];
  /** "in" for an incoming player, "match" for the open spot's position. */
  tone?: 'in' | 'match';
}) {
  if (id === null) return null;
  const position = positions.find((p) => p.id === id);
  return (
    <span className="pos" data-position={id}>
      <span className={tone ? `chip ${tone}` : 'chip'} aria-hidden>
        {position?.short ?? id}
      </span>
      <span className="sr-only">{position?.name ?? id}</span>
    </span>
  );
}

/** Every position a player can play, as chips in the team's order (G, F, C). */
export function PositionChips({
  skills,
  positions,
  highlight = null,
}: {
  skills: Partial<Record<string, unknown>>;
  positions: Position[];
  /** Highlights this position, e.g. the open spot in a substitution. */
  highlight?: string | null;
}) {
  return (
    <span className="chips">
      {positions
        .filter((p) => skills[p.id] !== undefined)
        .map((p) => (
          <PositionChip key={p.id} id={p.id} positions={positions} tone={p.id === highlight ? 'match' : undefined} />
        ))}
    </span>
  );
}

/** Segments played at each position, e.g. [G] 3 [F] 1, in the team's order (S3, S4). */
export function PositionCounts({
  byPosition,
  positions,
}: {
  byPosition: Partial<Record<string, number>>;
  positions: Position[];
}) {
  const played = positions.filter((p) => (byPosition[p.id] ?? 0) > 0);
  if (played.length === 0) return <>–</>;
  return (
    <span className="pos-counts">
      {played.map((p) => (
        <span key={p.id} className="pos-count">
          <PositionChip id={p.id} positions={positions} /> {byPosition[p.id]}
        </span>
      ))}
    </span>
  );
}
