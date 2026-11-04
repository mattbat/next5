/**
 * Screenshots used by the in-app help and the first-run intro (H-1, H-3).
 * Made by `npm run screenshots` (scripts/screens/capture.spec.ts) from the
 * demo team, in both themes, as public/help/<name>-<theme>.webp.
 */
export const SHOTS = {
  teams: 'The Teams screen with the Demo Hoopers team',
  roster: 'A team’s Roster tab listing players with their positions',
  player: 'Editing a player: name, number, and a skill level for each position',
  'team-settings': 'A team’s Settings tab: position requirement and default game format',
  setup: 'Game setup: opponent, date, and who is attending',
  plan: 'The plan for one segment: five players on the court with positions, and the bench',
  'plan-player': 'Options for one player in the plan: swap, lock in or lock out',
  'plan-notice': 'After locking a player out: a note saying which other lineups changed, with Undo',
  'plan-grid': 'The rotation grid: players down the side, segments across, position letters in each cell',
  share: 'The Share game sheet: Text a link or AirDrop a file',
  gameday: 'Game Day: who is on the court, the IN and OUT pairs for the next sub, and the Next button',
  'gameday-player': 'Tapping a player on game day: Sub out now, Injured, or Rest',
  replan: 'Re-plan preview: the upcoming lineups that change, with new players highlighted',
  'gameday-menu': 'The Game Day Edit menu: re-plan, overtime, share, and every player’s status',
  final: 'The Final screen: segments planned, played and sat for each player',
  stats: 'Season stats on the team’s Stats tab',
  settings: 'Settings: back up, restore, appearance and updates',
  receive: 'Opening a shared game: what it is and Open here',
} as const;

export type ShotName = keyof typeof SHOTS;

/** Every screenshot is a full iPhone 17 screen, in CSS pixels. */
export const SHOT_SIZE = { width: 402, height: 874 } as const;

export function shotUrl(name: ShotName, theme: 'dark' | 'light'): string {
  return `${import.meta.env.BASE_URL}help/${name}-${theme}.webp`;
}
