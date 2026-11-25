import type { Drill, Player, Practice, PracticeBlock, Station, Team } from '../data/types';
import {
  addTime,
  alwaysBring,
  blockStarts,
  drillName,
  equipmentList,
  formatTime,
  groupFrom,
  groupLabel,
  names,
  needsFullCourt,
  plannedMinutes,
  rotationCount,
  rotationEnds,
  stationPlayerNames,
  whenLabel,
  type DrillIndex,
} from './practice';

/**
 * The coaches' plan (PR10): one detailed document, enough to run the whole
 * practice from paper. It is built once as a list of items with no layout in
 * it; the shared text and the PDF both draw that list, so they always agree.
 */
export type PlanItem =
  | { kind: 'title'; text: string }
  /** A block's clock times, e.g. "6:10–6:20 PM (10 min)". */
  | { kind: 'time'; text: string }
  /** A drill, rotation or section. */
  | { kind: 'heading'; text: string }
  | { kind: 'line'; text: string; indent: 0 | 1; bold?: boolean }
  | { kind: 'gap' };

/** "6:10–6:20 PM" (or "6:50 PM–7:05 AM" across noon), or "0:10–0:20" into practice with no start time. */
function rangeLabel(practice: Pick<Practice, 'time'>, from: number, to: number): string {
  if (!practice.time) {
    const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    return `${clock(from)}–${clock(to)}`;
  }
  const start = formatTime(addTime(practice.time, from));
  const end = formatTime(addTime(practice.time, to));
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`;
}

/** "10 min", "3 min 20 sec". */
function lengthLabel(ms: number): string {
  const whole = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (seconds === 0) return `${whole} min`;
  return whole === 0 ? `${seconds} sec` : `${whole} min ${seconds} sec`;
}

function playersText(practice: Practice, station: Station, roster: Player[]): string {
  if (station.group === 'all') return 'Everyone';
  const who = stationPlayerNames(practice, station, roster);
  if (station.group === 'custom') return who || 'no players picked';
  return `${groupLabel(station.group)} (${who || 'not split yet'})`;
}

const noteLines = (drill: Drill | undefined): string[] =>
  (drill?.notes ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** What the drill needs and its coaching points, in full. */
function drillDetails(drill: Drill | undefined): PlanItem[] {
  const items: PlanItem[] = [];
  if (drill?.equipment.length)
    items.push({
      kind: 'line',
      text: `Needs: ${drill.equipment.join(', ')}`,
      indent: 1,
    });
  for (const text of noteLines(drill)) items.push({ kind: 'line', text, indent: 1 });
  return items;
}

/** One station, drawn in full: parallel and single blocks (PR4). */
function stationItems(practice: Practice, station: Station, drills: DrillIndex, roster: Player[]): PlanItem[] {
  const items: PlanItem[] = [{ kind: 'heading', text: drillName(drills, station.drillId) }];
  if (station.coach.trim())
    items.push({
      kind: 'line',
      text: `Coach: ${station.coach.trim()}`,
      indent: 1,
    });
  items.push(
    {
      kind: 'line',
      text: `Players: ${playersText(practice, station, roster)}`,
      indent: 1,
    },
    ...drillDetails(drills.get(station.drillId)),
  );
  return items;
}

/** A rotating block (PR4b): who is where in each rotation, then each drill once. */
function rotatingItems(practice: Practice, block: PracticeBlock, start: number, drills: DrillIndex, roster: Player[]): PlanItem[] {
  const ends = rotationEnds(block);
  const items: PlanItem[] = [
    {
      kind: 'line',
      text: `${ends.length} stations, rotating: each group moves to the next station`,
      indent: 0,
    },
  ];
  ends.forEach((end, r) => {
    const from = r === 0 ? 0 : ends[r - 1]!;
    const when = rangeLabel(practice, start + Math.round(from / 60_000), start + Math.round(end / 60_000));
    items.push(
      { kind: 'gap' },
      {
        kind: 'heading',
        text: `Rotation ${r + 1}: ${when} (${lengthLabel(end - from)})`,
      },
    );
    block.stations.forEach((station, i) => {
      items.push({
        kind: 'line',
        text: drillName(drills, station.drillId),
        indent: 0,
        bold: true,
      });
      if (station.coach.trim())
        items.push({
          kind: 'line',
          text: `Coach: ${station.coach.trim()}`,
          indent: 1,
        });
      items.push({
        kind: 'line',
        text: `Players: ${playersText(practice, groupFrom(block, i, r), roster)}`,
        indent: 1,
      });
    });
  });
  const details = block.stations.map((s) => ({
    name: drillName(drills, s.drillId),
    items: drillDetails(drills.get(s.drillId)),
  }));
  if (details.some((d) => d.items.length > 0)) {
    items.push({ kind: 'gap' }, { kind: 'heading', text: 'About these drills' });
    for (const d of details) if (d.items.length > 0) items.push({ kind: 'line', text: d.name, indent: 0, bold: true }, ...d.items);
  }
  return items;
}

/** The coaches' plan as a list of items (PR10). Skipped blocks are left out. */
export function coachesPlan(practice: Practice, team: Team, drills: DrillIndex, roster: Player[]): PlanItem[] {
  const items: PlanItem[] = [
    { kind: 'title', text: `${team.name} practice` },
    {
      kind: 'line',
      text: `${whenLabel(practice)} · ${plannedMinutes(practice)} min`,
      indent: 0,
    },
  ];
  if (practice.focus.trim())
    items.push({
      kind: 'line',
      text: `Focus: ${practice.focus.trim()}`,
      indent: 0,
    });
  items.push({
    kind: 'line',
    text: needsFullCourt(practice, drills) ? 'Court: full court' : 'Court: half court is enough',
    indent: 0,
  });
  const starts = blockStarts(practice);
  practice.blocks.forEach((block, i) => {
    const start = starts[i];
    if (start === null || start === undefined) return;
    items.push(
      { kind: 'gap' },
      {
        kind: 'time',
        text: `${rangeLabel(practice, start, start + block.minutes)} (${block.minutes} min)`,
      },
    );
    if (rotationCount(block) > 1) {
      items.push(...rotatingItems(practice, block, start, drills, roster));
      return;
    }
    if (block.stations.length > 1)
      items.push({
        kind: 'line',
        text: `${block.stations.length} stations at the same time`,
        indent: 0,
      });
    block.stations.forEach((station, i) => {
      if (i > 0) items.push({ kind: 'gap' });
      items.push(...stationItems(practice, station, drills, roster));
    });
  });
  if (practice.teams.A.length + practice.teams.B.length > 0) {
    items.push(
      { kind: 'gap' },
      { kind: 'heading', text: 'Scrimmage teams' },
      {
        kind: 'line',
        text: `Team A: ${names(practice.teams.A, roster)}`,
        indent: 0,
      },
      {
        kind: 'line',
        text: `Team B: ${names(practice.teams.B, roster)}`,
        indent: 0,
      },
    );
  }
  const equipment = equipmentList(practice, drills, alwaysBring(team));
  if (equipment.length > 0) {
    items.push(
      { kind: 'gap' },
      { kind: 'heading', text: 'Bring' },
      {
        kind: 'line',
        text: equipment.map((e) => e.item).join(', '),
        indent: 0,
      },
    );
  }
  return items;
}

/** The plan as plain text, for Messages, Mail or Notes. Web links stay whole so those apps make them tappable. */
export function planText(items: PlanItem[]): string {
  const lines = items.map((item) => {
    if (item.kind === 'gap') return '';
    if (item.kind === 'line') return (item.indent ? '  ' : '') + item.text;
    return item.text;
  });
  return lines.join('\n') + '\n';
}

/** The coaches' plan as text (PR10). */
export const coachesPlanText = (practice: Practice, team: Team, drills: DrillIndex, roster: Player[]): string =>
  planText(coachesPlan(practice, team, drills, roster));
