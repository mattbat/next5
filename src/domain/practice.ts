import { DEFAULT_ALWAYS_BRING } from '../data/starterDrills';
import type { Drill, Player, Practice, PracticeBlock, Station, StationGroup, Team } from '../data/types';
import { formatGameDate } from './game';

/**
 * Practice planning (REQUIREMENTS.md PR1–PR11): totals, equipment,
 * scrimmage teams, the run timer, season stats and the shared texts. Pure:
 * screens save the results through src/data/repo.ts.
 */

export type DrillIndex = Map<string, Drill>;

export const indexDrills = (drills: Drill[]): DrillIndex => new Map(drills.map((d) => [d.id, d]));

/** A station's drill name, even if the drill has since been deleted. */
export const drillName = (drills: DrillIndex, id: string): string => drills.get(id)?.name ?? 'Deleted drill';

/** The blocks that will run (or ran): not skipped. */
export const activeBlocks = (practice: Pick<Practice, 'blocks'>): PracticeBlock[] => practice.blocks.filter((b) => !b.skipped);

/** Planned minutes, not counting skipped blocks (PR4). */
export function plannedMinutes(practice: Pick<Practice, 'blocks'>): number {
  return activeBlocks(practice).reduce((sum, b) => sum + b.minutes, 0);
}

/** True when any drill still in the plan needs the full court (PR4). */
export function needsFullCourt(practice: Pick<Practice, 'blocks'>, drills: DrillIndex): boolean {
  return activeBlocks(practice).some((b) => b.stations.some((s) => drills.get(s.drillId)?.court === 'full'));
}

/** The team's always-bring list (PR6), or the defaults if it was never set. */
export const alwaysBring = (team: Pick<Team, 'alwaysBring'>): string[] => team.alwaysBring ?? DEFAULT_ALWAYS_BRING;

export interface EquipmentItem {
  item: string;
  /** Drills that need it; empty for always-bring items. */
  for: string[];
}

/**
 * One checklist for a practice (PR6): the team's always-bring items, then
 * what the drills still in the plan need. Items are matched ignoring case.
 */
export function equipmentList(practice: Pick<Practice, 'blocks'>, drills: DrillIndex, always: string[]): EquipmentItem[] {
  const items = new Map<string, EquipmentItem>();
  const add = (item: string, drill?: string) => {
    const name = item.trim();
    if (!name) return;
    const key = name.toLowerCase();
    const entry = items.get(key) ?? { item: name, for: [] };
    if (drill && !entry.for.includes(drill)) entry.for.push(drill);
    items.set(key, entry);
  };
  for (const item of always) add(item);
  for (const block of activeBlocks(practice)) {
    for (const station of block.stations) {
      const drill = drills.get(station.drillId);
      for (const item of drill?.equipment ?? []) add(item, drill!.name);
    }
  }
  return [...items.values()];
}

// Scrimmage teams (PR5)

export type Split = { A: string[]; B: string[] };

/** A player's rating for balancing: their best skill level (P3), or 1 with none. */
export function skillOf(player: Pick<Player, 'skills'>): number {
  const levels = Object.values(player.skills).filter((v): v is 1 | 2 | 3 => v !== undefined);
  return levels.length > 0 ? Math.max(...levels) : 1;
}

/** The position a player is best at, for spreading positions across teams. */
function mainPosition(player: Pick<Player, 'skills'>): string | null {
  let best: string | null = null;
  let level = 0;
  for (const [position, skill] of Object.entries(player.skills)) {
    if (skill !== undefined && skill > level) {
      best = position;
      level = skill;
    }
  }
  return best;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Splits players into teams A and B (PR5) whose sizes differ by at most one.
 * - balanced: strongest first, each to the team with the lower total skill;
 *   on a tie, to the team with fewer players at their main position. Within
 *   a skill level, players are grouped by position, so two Go-To guards land
 *   on different teams. Otherwise the order is shuffled, so splitting again
 *   can give new teams.
 * - random: a shuffle, dealt out in turn.
 */
export function splitTeams(players: Pick<Player, 'id' | 'skills'>[], mode: 'balanced' | 'random', random = Math.random): Split {
  const shuffled = shuffle(players, random);
  const split: Split = { A: [], B: [] };
  if (mode === 'random') {
    shuffled.forEach((p, i) => (i % 2 === 0 ? split.A : split.B).push(p.id));
    return split;
  }
  const cap = Math.ceil(players.length / 2);
  const total = { A: 0, B: 0 };
  const positions = { A: new Map<string, number>(), B: new Map<string, number>() };
  const order = [...shuffled].sort(
    (a, b) => skillOf(b) - skillOf(a) || (mainPosition(a) ?? '~').localeCompare(mainPosition(b) ?? '~'),
  );
  for (const player of order) {
    const position = mainPosition(player);
    const atPosition = (team: 'A' | 'B') => (position ? (positions[team].get(position) ?? 0) : 0);
    let team: 'A' | 'B';
    if (split.A.length >= cap) team = 'B';
    else if (split.B.length >= cap) team = 'A';
    else if (total.A !== total.B) team = total.A < total.B ? 'A' : 'B';
    else if (atPosition('A') !== atPosition('B')) team = atPosition('A') < atPosition('B') ? 'A' : 'B';
    else team = split.A.length <= split.B.length ? 'A' : 'B';
    split[team].push(player.id);
    total[team] += skillOf(player);
    if (position) positions[team].set(position, atPosition(team) + 1);
  }
  return split;
}

/** Moves a player to the other team, or onto team A if they weren't on one. */
export function movePlayer(split: Split, playerId: string): Split {
  if (split.A.includes(playerId)) return { A: split.A.filter((id) => id !== playerId), B: [...split.B, playerId] };
  if (split.B.includes(playerId)) return { A: [...split.A, playerId], B: split.B.filter((id) => id !== playerId) };
  return { A: [...split.A, playerId], B: split.B };
}

/** Total skill of a team, to show how even the split is. */
export function teamSkill(ids: string[], players: Pick<Player, 'id' | 'skills'>[]): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  return ids.reduce((sum, id) => sum + (byId.has(id) ? skillOf(byId.get(id)!) : 0), 0);
}

// Running a practice (PR7)

/** Milliseconds on the current block's clock. */
export function elapsedMs(clock: Practice['clock'], now: number): number {
  return clock.elapsed + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));
}

/** Milliseconds left on the current block; negative once it runs over. */
export function remainingMs(practice: Pick<Practice, 'blocks' | 'current' | 'clock'>, now: number): number {
  const block = practice.blocks[practice.current];
  return (block?.minutes ?? 0) * 60_000 - elapsedMs(practice.clock, now);
}

/** "4:05", or "-0:30" once over time. */
export function formatClock(ms: number): string {
  const over = ms < 0;
  const seconds = over ? Math.ceil(-ms / 1000) : Math.ceil(ms / 1000);
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return over ? `-${text}` : text;
}

const nextActive = (blocks: PracticeBlock[], after: number) => blocks.findIndex((b, i) => i > after && !b.skipped);

type RunState = Pick<Practice, 'blocks' | 'current' | 'clock' | 'status'>;

/** Starts the practice on its first block that isn't skipped, or null if every block is. */
export function startPractice(practice: Pick<Practice, 'blocks'>, now: number): RunState | null {
  const first = nextActive(practice.blocks, -1);
  if (first === -1) return null;
  return { blocks: practice.blocks, status: 'live', current: first, clock: { startedAt: now, elapsed: 0 } };
}

export function pauseClock(practice: Pick<Practice, 'clock'>, now: number): Pick<Practice, 'clock'> {
  return { clock: { startedAt: null, elapsed: elapsedMs(practice.clock, now) } };
}

export function resumeClock(practice: Pick<Practice, 'clock'>, now: number): Pick<Practice, 'clock'> {
  return practice.clock.startedAt === null ? { clock: { startedAt: now, elapsed: practice.clock.elapsed } } : { clock: practice.clock };
}

/** Adds a minute to the current block. */
export function addMinute(practice: Pick<Practice, 'blocks' | 'current'>): Pick<Practice, 'blocks'> {
  return {
    blocks: practice.blocks.map((b, i) => (i === practice.current ? { ...b, minutes: b.minutes + 1 } : b)),
  };
}

/** Moves on from the current block, which is recorded as run or skipped; ends after the last. */
function advance(practice: RunState, now: number, skip: boolean): RunState {
  const seconds = Math.round(elapsedMs(practice.clock, now) / 1000);
  const blocks = practice.blocks.map((b, i) =>
    i !== practice.current ? b : skip ? { ...b, skipped: true, actualSeconds: undefined } : { ...b, actualSeconds: seconds },
  );
  const next = nextActive(blocks, practice.current);
  if (next === -1) return { blocks, status: 'done', current: practice.current, clock: { startedAt: null, elapsed: 0 } };
  return { blocks, status: 'live', current: next, clock: { startedAt: now, elapsed: 0 } };
}

/** Next: records how long the current block took and starts the next one. */
export const nextBlock = (practice: RunState, now: number): RunState => advance(practice, now, false);

/** Skip: the current block didn't happen; start the next one. */
export const skipBlock = (practice: RunState, now: number): RunState => advance(practice, now, true);

/**
 * Ends the practice now: the current block counts for the time it ran (if
 * any), and blocks not reached are marked skipped so stats leave them out.
 */
export function finishPractice(practice: RunState, now: number): RunState {
  const seconds = Math.round(elapsedMs(practice.clock, now) / 1000);
  const blocks = practice.blocks.map((b, i) => {
    if (i < practice.current || b.skipped) return b;
    if (i === practice.current && seconds > 0) return { ...b, actualSeconds: seconds };
    return { ...b, skipped: true };
  });
  return { blocks, status: 'done', current: practice.current, clock: { startedAt: null, elapsed: 0 } };
}

// Season stats (PR9)

export interface TagStat {
  tag: string;
  minutes: number;
  /** Share of practice time, 0–100. Can add up to more than 100: drills have several tags, and stations run together. */
  percent: number;
}

export interface DrillStat {
  drillId: string;
  name: string;
  uses: number;
  minutes: number;
  lastDate: string;
  up: number;
  down: number;
}

export interface PracticeStats {
  practices: number;
  /** Practice time, counting each block once. */
  minutes: number;
  tags: TagStat[];
  drills: DrillStat[];
}

/** A block's minutes for stats: how long it really ran if known, else the plan. */
const blockMinutes = (b: PracticeBlock) => (b.actualSeconds !== undefined ? b.actualSeconds / 60 : b.minutes);

export function practiceStats(practices: Practice[], drills: DrillIndex): PracticeStats {
  const done = practices.filter((p) => p.status === 'done');
  const tagMinutes = new Map<string, number>();
  const byDrill = new Map<string, DrillStat>();
  let total = 0;
  for (const practice of done) {
    for (const block of activeBlocks(practice)) {
      const minutes = blockMinutes(block);
      total += minutes;
      for (const station of block.stations) {
        const drill = drills.get(station.drillId);
        const stat = byDrill.get(station.drillId) ?? {
          drillId: station.drillId,
          name: drillName(drills, station.drillId),
          uses: 0,
          minutes: 0,
          lastDate: '',
          up: 0,
          down: 0,
        };
        stat.uses++;
        stat.minutes += minutes;
        if (practice.date > stat.lastDate) stat.lastDate = practice.date;
        if (station.rating === 'up') stat.up++;
        if (station.rating === 'down') stat.down++;
        byDrill.set(station.drillId, stat);
        const tags = drill && drill.tags.length > 0 ? drill.tags : ['Untagged'];
        for (const tag of tags) tagMinutes.set(tag, (tagMinutes.get(tag) ?? 0) + minutes);
      }
    }
  }
  const round = (n: number) => Math.round(n);
  return {
    practices: done.length,
    minutes: round(total),
    tags: [...tagMinutes]
      .map(([tag, minutes]) => ({ tag, minutes: round(minutes), percent: total > 0 ? Math.round((minutes / total) * 100) : 0 }))
      .sort((a, b) => b.minutes - a.minutes || a.tag.localeCompare(b.tag)),
    drills: [...byDrill.values()]
      .map((s) => ({ ...s, minutes: round(s.minutes) }))
      .sort((a, b) => b.minutes - a.minutes || b.uses - a.uses || a.name.localeCompare(b.name)),
  };
}

export interface DrillNote {
  practiceId: string;
  date: string;
  rating?: 'up' | 'down';
  note: string;
}

/** How a drill went in past practices (PR8), newest first. */
export function drillNotes(drillId: string, practices: Practice[]): DrillNote[] {
  const notes: DrillNote[] = [];
  for (const practice of practices) {
    for (const block of practice.blocks) {
      for (const s of block.stations) {
        if (s.drillId === drillId && (s.rating || s.note?.trim())) {
          notes.push({ practiceId: practice.id, date: practice.date, rating: s.rating, note: s.note?.trim() ?? '' });
        }
      }
    }
  }
  return notes.sort((a, b) => b.date.localeCompare(a.date));
}

// Shared texts (PR10)

/** "18:30" → "6:30 PM". */
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** The clock time `minutes` after a start time, "18:00" + 75 → "19:15". */
export function addTime(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const total = (Number(match[1]) * 60 + Number(match[2]) + minutes) % (24 * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** When each block starts, as minutes from the start; skipped blocks have none. */
export function blockStarts(practice: Pick<Practice, 'blocks'>): (number | null)[] {
  let at = 0;
  return practice.blocks.map((b) => {
    if (b.skipped) return null;
    const start = at;
    at += b.minutes;
    return start;
  });
}

/** "6:08 PM" with a start time, else "0:08" into practice. */
function startLabel(practice: Pick<Practice, 'time'>, minutes: number): string {
  if (practice.time) return formatTime(addTime(practice.time, minutes));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Every coach named on a station, in order of first appearance. */
export function coachesIn(practice: Pick<Practice, 'blocks'>): string[] {
  const names: string[] = [];
  for (const block of activeBlocks(practice)) {
    for (const s of block.stations) {
      const name = s.coach.trim();
      if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    }
  }
  return names;
}

const GROUP_LABEL: Record<StationGroup, string> = { all: 'Everyone', A: 'Team A', B: 'Team B' };
export const groupLabel = (group: StationGroup) => GROUP_LABEL[group];

function heading(practice: Practice, team: Team): string {
  const when = [formatGameDate(practice.date), practice.time ? formatTime(practice.time) : ''].filter(Boolean).join(', ');
  return `${team.name} practice · ${when} · ${plannedMinutes(practice)} min`;
}

function names(ids: string[], roster: Player[]): string {
  const byId = new Map(roster.map((p) => [p.id, p.name]));
  return ids
    .map((id) => byId.get(id))
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

function stationLine(s: Station, drills: DrillIndex): string {
  const parts = [drillName(drills, s.drillId), s.coach.trim(), s.group === 'all' ? '' : GROUP_LABEL[s.group]];
  return parts.filter(Boolean).join(' · ');
}

/** The whole plan for coaches (PR10): read-only, for a message, Notes or printing. */
export function practicePlanText(practice: Practice, team: Team, drills: DrillIndex, roster: Player[]): string {
  const starts = blockStarts(practice);
  const lines = [heading(practice, team)];
  if (practice.focus.trim()) lines.push(`Focus: ${practice.focus.trim()}`);
  lines.push(needsFullCourt(practice, drills) ? 'Court: full court' : 'Court: half court is enough', '');
  practice.blocks.forEach((block, i) => {
    const start = starts[i];
    if (start === null || start === undefined) return;
    const time = `${startLabel(practice, start)} · ${block.minutes} min`;
    if (block.stations.length === 1) {
      lines.push(`${time} · ${stationLine(block.stations[0]!, drills)}`);
    } else {
      lines.push(`${time} · Stations at the same time:`);
      for (const s of block.stations) lines.push(`  • ${stationLine(s, drills)}`);
    }
  });
  if (practice.teams.A.length + practice.teams.B.length > 0) {
    lines.push('', `Team A: ${names(practice.teams.A, roster)}`, `Team B: ${names(practice.teams.B, roster)}`);
  }
  const equipment = equipmentList(practice, drills, alwaysBring(team));
  if (equipment.length > 0) lines.push('', `Bring: ${equipment.map((e) => e.item).join(', ')}`);
  return lines.join('\n') + '\n';
}

/**
 * One coach's station card (PR10): only the blocks they run, with times,
 * the group and its players, and the drill's coaching points.
 */
export function stationCardText(practice: Practice, team: Team, drills: DrillIndex, roster: Player[], coach: string): string {
  const starts = blockStarts(practice);
  const lines = [`${coach}: ${heading(practice, team)}`, ''];
  practice.blocks.forEach((block, i) => {
    const start = starts[i];
    if (start === null || start === undefined) return;
    for (const s of block.stations) {
      if (s.coach.trim().toLowerCase() !== coach.trim().toLowerCase()) continue;
      const drill = drills.get(s.drillId);
      lines.push(`${startLabel(practice, start)} · ${block.minutes} min · ${drillName(drills, s.drillId)}`);
      if (s.group !== 'all') lines.push(`  ${GROUP_LABEL[s.group]}: ${names(practice.teams[s.group], roster) || 'not split yet'}`);
      if (drill?.equipment.length) lines.push(`  Needs: ${drill.equipment.join(', ')}`);
      if (drill?.notes.trim()) lines.push(`  ${drill.notes.trim()}`);
      lines.push('');
    }
  });
  return lines.join('\n');
}

/**
 * The one-pager for parents (PR10): when, how long, what the team will work
 * on and the coach's note. No skill levels, groups or coaching notes.
 */
export function parentText(practice: Practice, team: Team, drills: DrillIndex): string {
  const lines = [heading(practice, team)];
  if (practice.focus.trim()) lines.push(`Focus: ${practice.focus.trim()}`);
  const workingOn: string[] = [];
  for (const block of activeBlocks(practice)) {
    for (const s of block.stations) {
      const drill = drills.get(s.drillId);
      if (drill?.tags.includes('Break')) continue;
      const name = drillName(drills, s.drillId);
      if (!workingOn.includes(name)) workingOn.push(name);
    }
  }
  if (workingOn.length > 0) lines.push('', 'What we’ll work on:', ...workingOn.map((n) => `• ${n}`));
  if (practice.parentNote.trim()) lines.push('', practice.parentNote.trim());
  return lines.join('\n') + '\n';
}

// Editing the plan (PR4)

/** A new block running one drill, at its default length. */
export function blockFor(drill: Pick<Drill, 'id' | 'minutes'>, id: string): PracticeBlock {
  return { id, minutes: drill.minutes, stations: [{ drillId: drill.id, coach: '', group: 'all' }], skipped: false };
}

/** Moves a block up (-1) or down (+1). */
export function moveBlock(blocks: PracticeBlock[], index: number, by: -1 | 1): PracticeBlock[] {
  const to = index + by;
  if (to < 0 || to >= blocks.length) return blocks;
  const copy = [...blocks];
  [copy[index], copy[to]] = [copy[to]!, copy[index]!];
  return copy;
}
