import { useEffect, useState, type CSSProperties } from 'react';
import { Empty, Info, Jersey, PositionChips, Section, Segmented, Sheet, Stepper, TopBar } from '../components/ui';
import { deletePractice, editPractice, newId, toggleStationPlayer, togglePracticeAttending, updatePractice, updateStation } from '../data/repo';
import { shareFile, shareText } from '../data/share';
import type { Drill, Player, Practice, PracticeBlock, StationGroup, Team } from '../data/types';
import {
  addTime,
  alwaysBring,
  blockFor,
  blockStarts,
  drillName,
  equipmentList,
  formatTime,
  groupLabel,
  inOtherStations,
  notInAnyStation,
  lateBlocks,
  moveBlock,
  movePlayer,
  needsFullCourt,
  parentText,
  plannedMinutes,
  rotationCount,
  rotationLength,
  splitTeams,
  stationPlayerIds,
  stationPlayerNames,
  startPractice,
  undoRun,
  withUndo,
  type DrillIndex,
} from '../domain/practice';
import { formatGameDate } from '../domain/game';
import { coachesPlan, coachesPlanText } from '../domain/practicePlan';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { usePracticeData } from '../hooks/usePracticeData';
import { navigate, paths } from '../router';
import { HelpLink } from '../help/parts';
import { DrillPicker } from './DrillSheet';

/** A practice's plan (PR4–PR6, PR10), and its review once it has run (PR8). */
export function PracticeScreen({ practiceId }: { practiceId: string }) {
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
  return <Plan key={data.practice.id} {...data} />;
}

interface PlanProps {
  practice: Practice;
  team: Team;
  roster: Player[];
  drills: Drill[];
  drillIndex: DrillIndex;
}

function Plan({ practice, team, roster, drills, drillIndex }: PlanProps) {
  const [picking, setPicking] = useState<{ blockId: string | null } | null>(null);
  const [choosing, setChoosing] = useState<{ blockId: string; index: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const done = practice.status === 'done';
  const live = practice.status === 'live';
  // While running, only blocks still to come can change.
  const editable = (index: number) => !done && (!live || index > practice.current);
  const total = plannedMinutes(practice);
  const starts = blockStarts(practice);
  // Drills that won't finish within the target length (PR4a).
  const now = useNow(live);
  const late = lateBlocks(practice, now);
  const firstLate = practice.blocks.find((b) => late.has(b.id));
  const firstMovable = live ? practice.current + 1 : 0;
  const drag = useBlockDrag(practice.blocks.map((b) => b.id), done ? practice.blocks.length : firstMovable, (id, move) =>
    // Resolved against the latest saved plan, so quick moves never use a stale position.
    void editPractice(practice.id, (p) => {
      const from = p.blocks.findIndex((b) => b.id === id);
      const to = 'to' in move ? move.to : from + move.by;
      return to < firstMovable ? null : { blocks: moveBlock(p.blocks, from, to) };
    }),
  );

  const pick = (drill: Drill) => {
    const target = picking?.blockId ?? null;
    setPicking(null);
    void editPractice(practice.id, (p) =>
      target === null
        ? { blocks: [...p.blocks, blockFor(drill, newId())] }
        : {
            blocks: p.blocks.map((b) =>
              b.id === target ? { ...b, stations: [...b.stations, { drillId: drill.id, coach: '', group: 'all' as const }] } : b,
            ),
          },
    );
  };

  const changeBlock = (blockId: string, change: (b: PracticeBlock) => PracticeBlock | null) =>
    void editPractice(practice.id, (p) => ({
      blocks: p.blocks.map((b) => (b.id === blockId ? change(b) : b)).filter((b): b is PracticeBlock => b !== null),
    }));

  const start = async () => {
    let started = false;
    await editPractice(practice.id, (p) => {
      const run = startPractice(p, Date.now());
      started = run !== null;
      return withUndo(p, 'Start practice', run);
    });
    if (started) navigate(paths.practiceRun(practice.id));
    else setMessage('Add a drill that isn’t skipped before starting.');
  };

  const share = async (title: string, text: string) => setMessage(await shareText(title, text));

  // The PDF library is loaded only now, so it isn't part of the app's first load.
  const sharePdf = async () => {
    setMessage('Making the PDF…');
    try {
      const { buildPlanPdf, practicePdfName } = await import('../data/practicePdf');
      const pdf = await buildPlanPdf(coachesPlan(practice, team, drillIndex, roster), `${team.name} practice plan`);
      const outcome = await shareFile(practicePdfName(practice.date), pdf, 'application/pdf');
      setMessage(outcome === 'cancelled' ? 'Sharing cancelled.' : outcome === 'shared' ? 'Plan shared.' : 'PDF downloaded.');
    } catch {
      setMessage('Couldn’t make the PDF. Try the text plan instead.');
    }
  };

  return (
    <main className="screen with-footer">
      <TopBar title={done ? 'Practice review' : 'Practice'} back={paths.team(team.id)} />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {done && practice.lastRun && (
        <p className="notice notice-actions" role="status">
          <span>Practice ended.</span>
          <button
            type="button"
            className="link"
            onClick={() => void editPractice(practice.id, undoRun).then(() => navigate(paths.practiceRun(practice.id)))}
          >
            ↶ Undo {practice.lastRun.label}
          </button>
        </p>
      )}
      {done && <Review practice={practice} />}

      {!done && <Details practice={practice} />}

      <Section
        title="Plan"
        aside={
          <span className="plan-total">
            {total} of {practice.length} min
          </span>
        }
      >
        <p className="hint">
          {needsFullCourt(practice, drillIndex) ? 'Needs the full court.' : 'Half court is enough.'}
          <HelpLink topic="practice">Planning practices</HelpLink>
        </p>
        {firstLate && (
          <p className="late-note" role="status">
            {live ? 'Running' : 'Planned'} {Math.max(...late.values())} min past your{' '}
            {practice.length} min. Highlighted drills won’t finish on time.
          </p>
        )}
        {practice.blocks.length === 0 && <Empty>No drills yet. Tap + Add drill to build the plan from your library.</Empty>}
        <ol className={`blocks ${drag.dragging !== null ? 'dragging' : ''}`}>
          {practice.blocks.map((block, i) => (
            <BlockCard
              key={block.id}
              lateBy={late.get(block.id) ?? null}
              dragHandle={editable(i) ? drag.handleProps(i) : null}
              itemRef={drag.register(i)}
              itemStyle={drag.itemStyle(i)}
              isDragged={drag.dragging === i}
              practice={practice}
              roster={roster}
              block={block}
              index={i}
              start={starts[i] ?? null}
              drillIndex={drillIndex}
              editable={editable(i)}
              done={done}
              onChange={(change) => changeBlock(block.id, change)}
              onAddStation={() => setPicking({ blockId: block.id })}
              onChoose={(stationIndex) => setChoosing({ blockId: block.id, index: stationIndex })}
            />
          ))}
        </ol>
        {!done && (
          <button type="button" className="btn secondary wide top-gap" onClick={() => setPicking({ blockId: null })}>
            + Add drill
          </button>
        )}
      </Section>

      {!done && <Attendance practice={practice} roster={roster} />}
      <ScrimmageTeams practice={practice} roster={roster} disabled={done} />
      {!done && <Equipment practice={practice} team={team} drillIndex={drillIndex} />}

      <Section title="Share">
        <p className="hint">The coaches’ plan has every drill with its times, coaches, players, equipment and coaching points, so a coach can run practice from it. Skill levels are never included.</p>
        <div className="share-buttons">
          <button type="button" className="btn secondary wide" onClick={() => void share('Practice plan', coachesPlanText(practice, team, drillIndex, roster))}>
            Coaches’ plan
          </button>
          <button type="button" className="btn secondary wide" onClick={() => void sharePdf()}>
            Coaches’ plan (PDF)
          </button>
          <button type="button" className="btn secondary wide" onClick={() => void share('Practice for parents', parentText(practice, team, drillIndex))}>
            Parents
          </button>
        </div>
      </Section>

      <Section title="">
        <button
          type="button"
          className="btn danger wide"
          onClick={() => {
            const question = done ? 'Delete this practice and its notes? Its time comes out of season stats.' : 'Delete this practice?';
            if (window.confirm(question)) void deletePractice(practice.id).then(() => navigate(paths.team(team.id)));
          }}
        >
          Delete practice
        </button>
      </Section>

      {!done && (
        <footer className="footer">
          {live ? (
            <a className="btn wide big" href={paths.practiceRun(practice.id)}>
              Back to practice
            </a>
          ) : (
            <button type="button" className="btn wide big" onClick={() => void start()} disabled={practice.blocks.length === 0}>
              Start practice
            </button>
          )}
        </footer>
      )}

      {choosing && (
        <PlayersSheet practice={practice} team={team} roster={roster} drillIndex={drillIndex} {...choosing} onClose={() => setChoosing(null)} />
      )}

      {picking && (
        <DrillPicker
          drills={drills}
          title={picking.blockId ? 'Add a station' : 'Add a drill'}
          onPick={pick}
          onClose={() => setPicking(null)}
        />
      )}
    </main>
  );
}

/** Hand-picks the players for a custom station (PR4). A player is in one drill per block. */
function PlayersSheet({
  practice,
  team,
  roster,
  drillIndex,
  blockId,
  index,
  onClose,
}: {
  practice: Practice;
  team: Team;
  roster: Player[];
  drillIndex: DrillIndex;
  blockId: string;
  index: number;
  onClose: () => void;
}) {
  const block = practice.blocks.find((b) => b.id === blockId);
  const station = block?.stations[index];
  if (!block || !station) return null;
  const byId = new Map(roster.map((p) => [p.id, p]));
  const attending = practice.attending
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));
  const elsewhere = inOtherStations(practice, block, index);
  const picked = station.players ?? [];
  const idle = block.stations.length > 1 ? notInAnyStation(practice, block) : [];
  const idleNames = stationPlayerNames({ attending: practice.attending, teams: practice.teams }, { group: 'custom', players: idle }, roster);
  return (
    <Sheet title={`Players for ${drillName(drillIndex, station.drillId)}`} onClose={onClose}>
      {attending.length === 0 ? (
        <p className="hint">Nobody is marked as attending. Mark who is coming under Attending first.</p>
      ) : (
        <>
          <p className="hint">A player is in one drill at a time in this block. Ticking someone moves them here.</p>
          <ul className="list">
            {attending.map((p) => (
              <li key={p.id}>
                <label className="list-item check">
                  <Jersey number={p.number} />
                  <span className="list-title">
                    {p.name}
                    {elsewhere.has(p.id) && !picked.includes(p.id) && <span className="list-sub">In another drill</span>}
                  </span>
                  <PositionChips skills={p.skills} positions={team.positions} />
                  <input
                    type="checkbox"
                    checked={picked.includes(p.id)}
                    onChange={() => void toggleStationPlayer(practice.id, blockId, index, p.id)}
                    aria-label={`${p.name} in this drill`}
                  />
                  <span className="checkmark" aria-hidden />
                </label>
              </li>
            ))}
          </ul>
          {idleNames && <p className="hint">Not in a drill yet: {idleNames}</p>}
        </>
      )}
    </Sheet>
  );
}

/** The time, kept current every few seconds while practice runs, so running late shows up. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, [live]);
  return now;
}

/** Text kept locally while typing and saved when the field loses focus, so typing never races the database. */
function TextField({
  label,
  value,
  onSave,
  multiline = false,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const props = {
    value: text,
    placeholder,
    disabled,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: () => text !== value && onSave(text),
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
    </label>
  );
}

function Details({ practice }: { practice: Practice }) {
  const update = (changes: Partial<Practice>) => void updatePractice(practice.id, changes);
  return (
    <Section title="Details">
      <div className="field-row">
        <label className="field grow">
          <span>Date</span>
          <input type="date" value={practice.date} onChange={(e) => update({ date: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Start</span>
          <input type="time" value={practice.time} onChange={(e) => update({ time: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <span className="row-label">Target length</span>
        <Stepper
          label="minutes of practice"
          value={practice.length}
          min={15}
          max={180}
          // Steps of 5 from the latest saved length, so quick taps all count.
          onChange={(v) =>
            void editPractice(practice.id, (p) => ({
              length: Math.min(180, Math.max(15, v > practice.length ? Math.floor(p.length / 5) * 5 + 5 : Math.ceil(p.length / 5) * 5 - 5)),
            }))
          }
        />
      </div>
      <TextField label="Focus (optional)" value={practice.focus} placeholder="e.g. Defense" onSave={(focus) => update({ focus })} />
      <TextField
        label="Note for parents (optional)"
        value={practice.parentNote}
        multiline
        placeholder="e.g. Bring a water bottle and a white shirt."
       
        onSave={(parentNote) => update({ parentNote })}
      />
    </Section>
  );
}

function BlockCard({
  practice,
  roster,
  block,
  index,
  start,
  drillIndex,
  editable,
  done,
  onChange,
  onAddStation,
  onChoose,
  lateBy,
  dragHandle,
  itemRef,
  itemStyle,
  isDragged,
}: {
  practice: Practice;
  roster: Player[];
  block: PracticeBlock;
  index: number;
  start: number | null;
  drillIndex: DrillIndex;
  editable: boolean;
  done: boolean;
  onChange: (change: (b: PracticeBlock) => PracticeBlock | null) => void;
  onAddStation: () => void;
  /** Opens the player picker for a custom station. */
  onChoose: (stationIndex: number) => void;
  /** Minutes past the target length this block ends, or null if it finishes in time (PR4a). */
  lateBy: number | null;
  dragHandle: ReturnType<ReturnType<typeof useBlockDrag>['handleProps']> | null;
  itemRef: (el: HTMLElement | null) => void;
  itemStyle: CSSProperties | undefined;
  isDragged: boolean;
}) {
  const live = practice.status === 'live';
  const running = live && index === practice.current;
  const when =
    start === null ? 'Skipped' : practice.time ? formatTime(addTime(practice.time, start)) : start === 0 ? 'Start' : `+${start} min`;
  const stations = block.stations.length > 1;
  const actual = block.actualSeconds !== undefined ? Math.round(block.actualSeconds / 60) : null;
  const name = block.stations.map((s) => drillName(drillIndex, s.drillId)).join(' + ');

  return (
    <li
      ref={itemRef}
      style={itemStyle}
      className={`block ${block.skipped ? 'skipped' : ''} ${running ? 'running' : ''} ${lateBy !== null ? 'late' : ''} ${isDragged ? 'dragged' : ''}`}
      aria-label={`Block ${index + 1}`}
    >
      <div className="block-head">
        {dragHandle && (
          <button type="button" className="drag-handle" aria-label={`Drag ${name} to reorder`} {...dragHandle}>
            ⠿
          </button>
        )}
        <span className="block-when">
          {running ? 'Now' : when}
          {stations && (rotationCount(block) > 1 ? ` · Rotate every ${rotationLength(block)}` : ' · Stations')}
        </span>
        {editable ? (
          <Stepper label="minutes" value={block.minutes} min={1} max={90} onChange={(minutes) => onChange((b) => ({ ...b, minutes: Math.min(90, Math.max(1, b.minutes + (minutes > block.minutes ? 1 : -1))) }))}
          />
        ) : (
          <span className="block-minutes">
            {actual !== null && done ? `${actual} of ${block.minutes} min` : `${block.minutes} min`}
          </span>
        )}
      </div>
      {lateBy !== null && (
        <p className="late-tag">
          {running ? 'Running late: ' : ''}ends {lateBy} min past your {practice.length} min
        </p>
      )}
      {editable && stations && (
        <div className="station-mode">
          <Segmented<'parallel' | 'rotate'>
            label="How the stations run"
            value={block.rotate ? 'rotate' : 'parallel'}
            onChange={(mode) => onChange((b) => ({ ...b, rotate: mode === 'rotate' }))}
            options={[
              { value: 'parallel', label: 'Parallel' },
              { value: 'rotate', label: 'Rotate' },
            ]}
          />
          {block.rotate && (
            <p className="hint">
              Groups move to the next station every {rotationLength(block)}, with a beep. The groups below are where they start.
            </p>
          )}
        </div>
      )}
      <ul className="stations">
        {block.stations.map((s, si) => (
          <li key={si} className="station">
            <div className="station-name">
              <b>{drillName(drillIndex, s.drillId)}</b>
              {drillIndex.get(s.drillId)?.court === 'full' && <span className="chip muted">Full</span>}
              {editable && stations && (
                <button
                  type="button"
                  className="link small"
                  aria-label={`Remove ${drillName(drillIndex, s.drillId)}`}
                  onClick={() => onChange((b) => ({ ...b, stations: b.stations.filter((_, k) => k !== si) }))}
                >
                  Remove
                </button>
              )}
            </div>
            {editable ? (
              <div className="station-edit">
                <input
                  className="coach-input"
                  defaultValue={s.coach}
                  placeholder="Coach (optional)"
                  aria-label={`Coach for ${drillName(drillIndex, s.drillId)}`}
                  onBlur={(e) => e.target.value !== s.coach && void updateStation(practice.id, block.id, si, { coach: e.target.value.trim() })}
                />
                <Segmented<StationGroup>
                  label={`Group for ${drillName(drillIndex, s.drillId)}`}
                  value={s.group}
                  onChange={(group) => {
                    void updateStation(practice.id, block.id, si, { group });
                    // Picking Custom the first time goes straight to choosing.
                    if (group === 'custom' && !s.players?.length) onChoose(si);
                  }}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'A', label: 'A' },
                    { value: 'B', label: 'B' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
                {s.group === 'custom' && (
                  <button
                    type="button"
                    className="link small station-players"
                    aria-label={`Choose players for ${drillName(drillIndex, s.drillId)}`}
                    onClick={() => onChoose(si)}
                  >
                    {stationPlayerIds(practice, s).length === 0
                      ? 'Choose players'
                      : `${stationPlayerIds(practice, s).length} ${stationPlayerIds(practice, s).length === 1 ? 'player' : 'players'}: ${stationPlayerNames(practice, s, roster)} · Choose`}
                  </button>
                )}
              </div>
            ) : (
              (s.coach || s.group !== 'all') && (
                <p className="station-meta">{[s.coach, s.group === 'all' ? '' : groupLabel(s.group)].filter(Boolean).join(' · ')}</p>
              )
            )}
            {done && !block.skipped && <Rating practiceId={practice.id} blockId={block.id} index={si} station={s} />}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="block-actions">
          <button type="button" className="link small" onClick={onAddStation}>
            + Station
          </button>
          <button type="button" className="link small" onClick={() => onChange((b) => ({ ...b, skipped: !b.skipped }))}>
            {block.skipped ? 'Unskip' : 'Skip'}
          </button>
          <button
            type="button"
            className="link small danger-text push-right"
            onClick={() => window.confirm('Remove this block from the plan?') && onChange(() => null)}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

/** 👍 / 👎 and a note on how a drill went (PR8). */
export function Rating({
  practiceId,
  blockId,
  index,
  station,
}: {
  practiceId: string;
  blockId: string;
  index: number;
  station: { rating?: 'up' | 'down'; note?: string };
}) {
  const rate = (rating: 'up' | 'down') => void updateStation(practiceId, blockId, index, { rating: station.rating === rating ? undefined : rating });
  return (
    <div className="rating">
      <button type="button" className={`rate ${station.rating === 'up' ? 'on' : ''}`} aria-pressed={station.rating === 'up'} aria-label="Went well" onClick={() => rate('up')}>
        👍
      </button>
      <button type="button" className={`rate ${station.rating === 'down' ? 'on' : ''}`} aria-pressed={station.rating === 'down'} aria-label="Needs work" onClick={() => rate('down')}>
        👎
      </button>
      <input
        className="rate-note"
        defaultValue={station.note ?? ''}
        placeholder="Note (optional)"
        aria-label="Drill note"
        onBlur={(e) => e.target.value !== (station.note ?? '') && void updateStation(practiceId, blockId, index, { note: e.target.value.trim() })}
      />
    </div>
  );
}

function Review({ practice }: { practice: Practice }) {
  return (
    <Section title="How it went">
      <p className="hint">
        {formatGameDate(practice.date)}
        {practice.focus.trim() && ` · ${practice.focus.trim()}`}. Rate each drill below; notes show up on the drill in your library
        next time you plan.
      </p>
      <TextField label="What went well" value={practice.wentWell} multiline onSave={(wentWell) => void updatePractice(practice.id, { wentWell })} />
      <TextField label="Work on next time" value={practice.improve} multiline onSave={(improve) => void updatePractice(practice.id, { improve })} />
    </Section>
  );
}

function Attendance({ practice, roster }: { practice: Practice; roster: Player[] }) {
  const [open, setOpen] = useState(false);
  const players = roster.filter((p) => p.active || practice.attending.includes(p.id));
  return (
    <Section
      title={`Attending (${practice.attending.length})`}
      aside={
        <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Change'}
        </button>
      }
    >
      {open && (
        <ul className="list">
          {players.map((p) => (
            <li key={p.id}>
              <label className="list-item check">
                <Jersey number={p.number} />
                <span className="list-title">{p.name}</span>
                <input
                  type="checkbox"
                  checked={practice.attending.includes(p.id)}
                  onChange={() => void togglePracticeAttending(practice.id, p.id)}
                  aria-label={`${p.name} attending`}
                />
                <span className="checkmark" aria-hidden />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Teams A and B for scrimmages and station groups (PR5). Skill levels stay hidden (P6). */
function ScrimmageTeams({ practice, roster, disabled }: { practice: Practice; roster: Player[]; disabled: boolean }) {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const attending = practice.attending.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const split = practice.teams.A.length + practice.teams.B.length > 0;
  const unassigned = attending.filter((p) => !practice.teams.A.includes(p.id) && !practice.teams.B.includes(p.id));
  const setTeams = (teams: Practice['teams']) => void updatePractice(practice.id, { teams });
  if (disabled && !split) return null;

  const column = (team: 'A' | 'B') => (
    <div className="team-col">
      <h3 className="sheet-sub">
        Team {team} ({practice.teams[team].length})
      </h3>
      <ul className="team-list">
        {practice.teams[team]
          .map((id) => byId.get(id))
          .filter((p): p is Player => !!p)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="team-player"
               
                aria-label={`Move ${p.name} to team ${team === 'A' ? 'B' : 'A'}`}
                onClick={() => setTeams(movePlayer(practice.teams, p.id))}
              >
                {p.name}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );

  return (
    <Section
      title="Scrimmage teams"
      aside={
        <Info label="scrimmage teams">
          Balanced uses each player’s best skill level and spreads positions across the teams. Tap a player to move them
          to the other team. Stations can be set to team A or B.
        </Info>
      }
    >
      {!disabled && (
        <div className="footer-row">
          <button type="button" className="btn small secondary" onClick={() => setTeams(splitTeams(attending, 'balanced'))}>
            Balanced
          </button>
          <button type="button" className="btn small secondary" onClick={() => setTeams(splitTeams(attending, 'random'))}>
            Random
          </button>
          {split && (
            <button type="button" className="btn small secondary" onClick={() => setTeams({ A: [], B: [] })}>
              Clear
            </button>
          )}
        </div>
      )}
      {split ? (
        <>
          <div className="team-cols">
            {column('A')}
            {column('B')}
          </div>
          {unassigned.length > 0 && !disabled && (
            <p className="hint">
              Not on a team:{' '}
              {unassigned.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <button type="button" className="link inline" onClick={() => setTeams(movePlayer(practice.teams, p.id))}>
                    {p.name}
                  </button>
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <p className="hint">Not split yet. Splitting again gives new teams.</p>
      )}
    </Section>
  );
}

/** What to bring (PR6). The ticks are just for packing, so they aren't saved. */
function Equipment({ practice, team, drillIndex }: { practice: Practice; team: Team; drillIndex: DrillIndex }) {
  const [packed, setPacked] = useState<string[]>([]);
  const items = equipmentList(practice, drillIndex, alwaysBring(team));
  return (
    <Section title="Equipment">
      <p className="hint">The team’s always-bring list (team Settings) plus what the drills need.</p>
      <ul className="list">
        {items.map((e) => (
          <li key={e.item}>
            <label className="list-item check">
              <span className="list-title">
                {e.item}
                {e.for.length > 0 && <span className="list-sub">{e.for.join(', ')}</span>}
              </span>
              <input
                type="checkbox"
                checked={packed.includes(e.item)}
                onChange={() => setPacked(packed.includes(e.item) ? packed.filter((x) => x !== e.item) : [...packed, e.item])}
                aria-label={`${e.item} packed`}
              />
              <span className="checkmark" aria-hidden />
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}
