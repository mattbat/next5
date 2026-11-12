import { useEffect, useRef, useState } from 'react';
import { Empty, TopBar } from '../components/ui';
import { editPractice } from '../data/repo';
import type { Player, Practice } from '../data/types';
import {
  addMinute,
  drillName,
  finishPractice,
  formatClock,
  groupLabel,
  lateBlocks,
  nextBlock,
  pauseClock,
  remainingMs,
  resumeClock,
  skipBlock,
  undoRun,
  withUndo,
  type DrillIndex,
} from '../domain/practice';
import { usePracticeData } from '../hooks/usePracticeData';
import { useWakeLock } from '../hooks/useWakeLock';
import { beep, setSoundOn, soundOn, unlock } from '../practiceSound';
import { navigate, paths } from '../router';
import { Rating } from './PracticeScreen';

/** Running a practice (PR7): the current block's countdown, its stations and what's next. */
export function PracticeRunScreen({ practiceId, now = () => Date.now() }: { practiceId: string; now?: () => number }) {
  const data = usePracticeData(practiceId);
  if (data.state === 'loading') return <main className="screen" />;
  if (data.state === 'missing') {
    return (
      <main className="screen">
        <TopBar title="Practice" back={paths.teams()} />
        <Empty>This practice no longer exists.</Empty>
      </main>
    );
  }
  const { practice } = data;
  if (practice.status !== 'live') {
    return (
      <main className="screen">
        <TopBar title="Practice" back={paths.practice(practice.id)} />
        <Empty>{practice.status === 'done' ? 'This practice is over.' : 'This practice hasn’t started.'}</Empty>
        <a className="btn wide" href={paths.practice(practice.id)}>
          {practice.status === 'done' ? 'Review practice' : 'See the plan'}
        </a>
      </main>
    );
  }
  return <Run practice={practice} roster={data.roster} drillIndex={data.drillIndex} now={now} />;
}

/** Re-renders a few times a second so the clock moves. */
function useTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [active]);
}

function Run({ practice, roster, drillIndex, now }: { practice: Practice; roster: Player[]; drillIndex: DrillIndex; now: () => number }) {
  const running = practice.clock.startedAt !== null;
  useTick(running);
  const wake = useWakeLock(true);
  const [sound, setSound] = useState(soundOn);
  const block = practice.blocks[practice.current]!;
  const remaining = remainingMs(practice, now());
  const upcoming = practice.blocks.slice(practice.current + 1).filter((b) => !b.skipped);
  const byId = new Map(roster.map((p) => [p.id, p.name]));
  // Blocks done or skipped so far count, so skipping one doesn't renumber the rest.
  const active = practice.blocks.filter((b, i) => i <= practice.current || !b.skipped);
  const position = practice.current + 1;
  // Drills that won't finish within the target length at this pace (PR4a).
  const late = lateBlocks(practice, now());
  const lateNames = practice.blocks
    .filter((b) => late.has(b.id))
    .map((b) => b.stations.map((s) => drillName(drillIndex, s.drillId)).join(' + '));

  // Beep once at one minute left and three times at zero, once per block.
  const beeped = useRef<{ block: string; at: Set<string> }>({ block: block.id, at: new Set() });
  useEffect(() => {
    if (beeped.current.block !== block.id) beeped.current = { block: block.id, at: new Set() };
    const marks = beeped.current.at;
    if (block.minutes > 1 && remaining <= 60_000 && remaining > 55_000 && !marks.has('minute')) {
      marks.add('minute');
      beep(1);
    }
    if (remaining <= 0 && remaining > -5_000 && !marks.has('zero')) {
      marks.add('zero');
      beep(3);
    }
  });

  // Every timer button can be undone, in case of a wrong tap (PR7a).
  const act = (label: string, change: (p: Practice) => Partial<Practice> | null, then?: () => void) =>
    void editPractice(practice.id, (p) => withUndo(p, label, change(p))).then(then);
  const toReview = () => navigate(paths.practice(practice.id));
  const last = upcoming.length === 0;
  const end = () => {
    if (!window.confirm('End practice now? Drills not reached are marked skipped.')) return;
    act('End practice', (p) => finishPractice(p, now()), toReview);
  };
  const next = () => act(last ? 'Finish practice' : 'Next', (p) => nextBlock(p, now()), last ? toReview : undefined);
  const skip = () => act('Skip', (p) => skipBlock(p, now()), last ? toReview : undefined);

  return (
    <main className="screen with-footer practice-run" onPointerDown={unlock}>
      <TopBar
        title={`Block ${position} of ${active.length}`}
        back={paths.practice(practice.id)}
        action={
          <button type="button" className="link" onClick={end}>
            End
          </button>
        }
      />
      {wake.failed && <p className="hint">The screen may lock during practice. Keep the phone awake in Settings → Display & Brightness.</p>}

      <section className={`run-clock ${remaining < 0 ? 'over' : remaining <= 60_000 ? 'soon' : ''}`} aria-label="Time left">
        <span className="run-time" role="timer" aria-live="off">
          {formatClock(remaining)}
        </span>
        <span className="run-sub">{running ? (remaining < 0 ? 'Over time' : 'left') : 'Paused'}</span>
      </section>

      <div className="run-controls">
        <button type="button" className="btn secondary" onClick={() => act(running ? 'Pause' : 'Resume', (p) => (running ? pauseClock(p, now()) : resumeClock(p, now())))}>
          {running ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className="btn secondary" onClick={() => act('+1 min', addMinute)}>
          +1 min
        </button>
        <button type="button" className="btn secondary" onClick={skip}>
          Skip
        </button>
      </div>
      {practice.lastRun && (
        <button type="button" className="btn small secondary run-undo" onClick={() => void editPractice(practice.id, undoRun)}>
          ↶ Undo {practice.lastRun.label}
        </button>
      )}

      {late.size > 0 && (
        <p className="late-note" role="status">
          {Math.max(...late.values())} min past your {practice.length} min at this pace. Won’t finish on time: {lateNames.join(', ')}.
        </p>
      )}

      <ul className="run-stations">
        {block.stations.map((s, i) => {
          const drill = drillIndex.get(s.drillId);
          const players =
            s.group === 'all'
              ? ''
              : practice.teams[s.group]
                  .map((id) => byId.get(id))
                  .filter((n): n is string => !!n)
                  .sort((a, b) => a.localeCompare(b))
                  .join(', ');
          return (
            <li key={i} className="run-station">
              <h2>{drillName(drillIndex, s.drillId)}</h2>
              <p className="station-meta">
                {[s.coach, groupLabel(s.group), drill?.court === 'full' ? 'Full court' : 'Half court'].filter(Boolean).join(' · ')}
              </p>
              {players && <p className="hint">{players}</p>}
              {drill?.notes.trim() && <p className="run-notes">{drill.notes.trim()}</p>}
              {drill && drill.equipment.length > 0 && <p className="hint">Needs: {drill.equipment.join(', ')}</p>}
              <Rating practiceId={practice.id} blockId={block.id} index={i} station={s} />
            </li>
          );
        })}
      </ul>

      {upcoming.length > 0 && (
        <section className="run-next" aria-label="Up next">
          <h3 className="sheet-sub">Up next</h3>
          <p>
            {upcoming[0]!.stations.map((s) => drillName(drillIndex, s.drillId)).join(' + ')} · {upcoming[0]!.minutes} min
          </p>
        </section>
      )}

      <label className="toggle-label run-sound">
        <span>Beep at 1 minute and at 0</span>
        <input
          type="checkbox"
          role="switch"
          checked={sound}
          onChange={(e) => {
            setSoundOn(e.target.checked);
            setSound(e.target.checked);
          }}
        />
        <span className="switch" aria-hidden />
      </label>

      <footer className="footer">
        <button type="button" className="btn wide big" onClick={next}>
          {upcoming.length === 0 ? 'Finish practice' : 'Next'}
        </button>
      </footer>
    </main>
  );
}
