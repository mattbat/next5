# Implementation status

Tracks every requirement in [REQUIREMENTS.md](../REQUIREMENTS.md). Update this file in the same change that implements something.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started · 📱 Needs checking on a real iPhone

**Done:** MVP 1 (plan and run a game), game-day changes, backup and restore, and plan editing (G5a–G9). **Next:** see "Proposed next milestones" at the bottom of this file.

Last updated: 2026-11-03 (plan editing: segment stepper, locks, swaps, redo from here)

## 3. Platform and technical

| ID | Status | Notes |
|----|--------|-------|
| T1 | ✅ 📱 | Installable PWA with a manifest, icons and standalone display. |
| T2 | ✅ | No App Store or developer account. |
| T3 | ✅ | Deploys to GitHub Pages from `main` only after every CI job passes. |
| T4 | ✅ | `/next5/` base path and hash routing. |
| T5 | ✅ | Workbox precaches the app. Offline launch is tested in Chromium; WebKit's test browser can't drive service workers. |
| T6 | ✅ | IndexedDB through Dexie, with `navigator.storage.persist()` requested at startup. |
| T7 | ✅ | Schema v2 adds game-day fields and v3 adds planning locks, each with an `upgrade()` migration. Tests write v1 and v2 databases and check they open under v3 with nothing lost. Backups from older versions get the same upgrade on restore. |
| T8 | ✅ | "Update available" banner, hidden during a live game, with an hourly update check. |
| T9 | ✅ | React, TypeScript, Vite, vite-plugin-pwa, Dexie. |
| T10 | ✅ | Tested in WebKit at five phone sizes and on an iPhone 16 Pro (Home Screen app). |

## 4–5. Core concepts and rules

| ID | Status | Notes |
|----|--------|-------|
| Quarters / halves, segments per period | ✅ | Defaults: quarters × 2, halves × 4. |
| Overtime / extra segments | ✅ | See D11. |
| H1 Position coverage | 🟡 | Always enforced in generated plans. During a game, a coach-picked swap that leaves a position uncovered is allowed after a warning (decision 2026-11-03). When coverage is impossible the app explains what's missing, but doesn't yet offer one-tap "for this game only" fixes. |
| R1 Equal playing time | ✅ | Includes fair share for absences. |
| R2 Don't sit too long | ✅ | Limit is ⌈(players − 5) ÷ 5⌉. |
| R3 Balance skill | ✅ | Off by default. |
| Rule priority and plain-language warnings | ✅ | |
| Fewest changes | ✅ | Used by re-plan (D6) and by every plan edit (G7). |

## 6. Positions and skill levels

| ID | Status | Notes |
|----|--------|-------|
| P1 | 🟡 | Guard, Forward and Center per team; the position list can't be edited yet. |
| P2 | ✅ | |
| P3 | ✅ | Rising, Steady and Go-To. |
| P4 | ✅ | Steppers on the team's Settings tab. |
| P5 | ✅ | Positions are assigned by best skill. |
| P6 | ✅ | Skill levels appear only in the player editor. |

## 7. Teams and season setup

| ID | Status | Notes |
|----|--------|-------|
| M1 | 🟡 | Create, rename and delete. Archive is not built. |
| M2 | ✅ | New games start from the team's defaults. |
| M3 | ✅ | Add players, mark them inactive, edit positions and skill. Past games keep their lineups. |
| M4 | ⬜ | Copying a team into a new season. |

## 8. Pregame planning

| ID | Status | Notes |
|----|--------|-------|
| G1 | ✅ | Date, opponent and attendance. |
| G2 | ✅ | |
| G3 | ✅ | |
| G4 | ✅ | Generate, and Shuffle for a new seed. |
| G5 | ✅ | The **Grid** view: players × segments with positions and totals, plus "Heads up" warnings. Warnings are listed above the grid rather than highlighted in it. Locked cells are ringed (in) or show ✕ (out). Tapping a column opens that segment. |
| G5a | ✅ | The Plan screen opens on **Segments**: ‹ › to step, and a Q1–Q4 strip to jump to any segment (a dot marks segments with locks). Each segment shows the five with positions, then the bench. Swipe to step is not built. |
| G6 | ✅ | Tap a player → **Lock in** / **Lock out** / **Unlock**; **🔒 Lock lineup** locks the whole five (e.g. a closing lineup). Locks are stored on the game (schema v3), shown as 🔒 In / 🔒 Out, kept by Shuffle, Redo from here, and game-day re-plan and overtime. A player's game-day status wins over a lock-in. A player's locks are dropped when they stop attending. |
| G7 | ✅ | Automatic: every lock or swap re-fills the plan right away with the fewest changes, and says which other lineups changed (with Undo). If the locks make the plan impossible, the edit is refused and the message names the segment and the position or count that fails. Rules the locks break (e.g. a long bench stretch) show as warnings. Decision 2026-11-03: there's no separate "Fill around locks" button, because filling happens on every edit. |
| G8 | ✅ | **↻ Shuffle** regenerates the whole plan, and **↻ Redo from here** regenerates from the current segment on. Both keep every lock; Redo also keeps the earlier segments. Decision 2026-11-03: "Redo from here" makes a new shuffle for the rest of the game, because the fewest-changes version of it would return the same plan (edits already re-fill with fewest changes). |
| G9 | ✅ | Tap a court player → **Swap with someone on the bench** (players who can play the open position are listed first), or tap a bench player → **Put in for someone**. The swap is kept as locks, so later edits don't undo it. Swaps that leave a required position uncovered are blocked; swaps that break other rules warn first ("Swap anyway"). |
| G10 | ✅ | Everything saves immediately. |
| G11 | ⬜ | Duplicating a previous game's setup. |

## 9. Game day

| ID | Status | Notes |
|----|--------|-------|
| Main screen | ✅ | Period label, progress bar, on-court list with positions, IN/OUT pairs with position, and a large Next button. The screen is one viewport tall: rows keep their normal size when they fit and shrink a little when they don't (e.g. 5 in / 5 out), so it never scrolls. Tested from iPhone SE in Safari (375×548) up to Pro Max (440×956). |
| D1 | ✅ | |
| D2 | ✅ | |
| D3 | ✅ | Played segments are passed to the engine as `fixed`. |
| D4 | ✅ | Tap a player on the court → Sub out now; both players are credited for the segment. Tap an incoming player to send in someone else instead. The replacement list shows players who can play the open position first, with every player's positions (G, F, C). A swap that breaks any rule warns first ("Swap anyway"); it is never blocked. |
| D5 | ✅ | Injured / out for the game, rest for 1–3 segments, available again, and late arrival (adds a non-attending player). Takes effect from the next segment. |
| D6 | ✅ | Offered after every status change, from the Edit menu, and from a banner when the plan still includes someone who can't play. Preview shows which lineups change before accepting. |
| D7 | ✅ 📱 | Screen Wake Lock, re-acquired when the app returns to the foreground. Needs checking on the deployed (https) site; the Wi-Fi test link couldn't use it. |
| D8 | ✅ | Tested by reloading mid-game. |
| D9 | ✅ | End game, and "Undo end of game" to resume. |
| D10 | 🟡 | High-contrast dark theme with IN/OUT shown by words and arrows. The light theme is not built. |
| D11 | ✅ | "+ OT" on the last segment and "Add overtime segment" in the Edit menu, planned with the same rules. |

## 10. History and stats

| ID | Status | Notes |
|----|--------|-------|
| S1 | ✅ | Each game stores its setup, plan, played lineups (including mid-segment swaps) and a log of every change. |
| S2 | ✅ | Games tab lists games with their status; finished games open their summary, including "Changes from the plan". |
| S3 | 🟡 | The summary shows segments played per player. Planned segments, segments sat and positions played are not shown yet. |
| S4 | ⬜ | Season stats. |
| S5 | ⬜ | CSV export. |
| S6 | ⬜ | Approximate minutes. |

## 11. Data and backup

| ID | Status | Notes |
|----|--------|-------|
| B1 | ✅ | Settings → **Back up all teams**, or a team's Settings tab → **Back up this team**. Opens the iOS share sheet (Files, iCloud Drive, AirDrop); downloads the file where sharing isn't available. |
| B2 | ✅ | Settings → **Restore from a backup file** shows what's in it, then **Merge** (adds what's missing; the more recently changed copy wins; deletes nothing) or **Replace everything** (after confirming). Bad files are explained and change nothing. Backups from older versions are upgraded on restore. |
| B3 | ✅ | Teams screen reminder when there's a team and no backup, or the last one is over 30 days old. **Later** snoozes it for a week. |
| B4 | ✅ | Settings shows the version, links to Diagnostics, and has **Check for updates** (the app also checks hourly). |

## 12. Documentation and help

| ID | Status | Notes |
|----|--------|-------|
| H-1 | 🟡 | The coach section of the README is written. Screenshots are not added yet. |
| H-2 | ✅ | The developer section of the README, including how the engine works. |
| H-3 | ⬜ | First-run walkthrough. For now, the empty states and "Load demo team" stand in for it. |
| H-4 | ✅ | ⓘ explanations for rules, skill levels, the position requirement and the grid. |
| H-5 | ✅ | Plain-language errors and warnings. |
| H-6 | ✅ | |
| H-7 | ✅ | |

## 13–14. Design, quality and tests

| ID | Status | Notes |
|----|--------|-------|
| Design and UX | 🟡 📱 | Dark sports theme, safe areas, 44pt+ tap targets, no horizontal scrolling (tested). Dynamic Type and VoiceOver are only partly addressed. |
| N1 | 📱 | Not measured on a device. |
| N2 | ✅ | Tested: well under 1 second (the test allows 3 seconds for CI). |
| N3 | ✅ | |
| N4 | ✅ | No analytics or network calls. |
| N5 | ✅ | README → "How the rotation engine works". |
| Q-1 | ✅ | `npm run check` runs everything. |
| Q-2 | ✅ | Example and property tests, plus a performance check. |
| Q-3 | 🟡 | Storage, migrations, backup and restore, game logic, game-day changes, plan editing and screens are covered. CSV tests will come with that feature. |
| Q-4 | ✅ | WebKit at iPhone sizes: the full game flow (including stepping through the plan and a lock), adding players, an injury with re-plan and overtime, and Game Day fitting five screen sizes. Offline launch in Chromium. Data surviving an update is covered by the migration test (T7). |
| Q-5 | ✅ | Enforced: 95% for the engine and 80% overall. Currently about 100% and 97%. |
| Q-6 | ✅ | `.github/workflows/ci.yml`. |
| Q-7 | ✅ | |

## 16. Stretch goals

All ⬜: favorite lineups, automatic cloud backup, sharing and sync.

---

## Proposed next milestones

In priority order:

1. ~~Mid-game: swap now (D4), player status (D5), re-plan from here (D6), overtime and extra segments (D11).~~ Done.
2. ~~Planning: step through segments (G5a), manual lineups and locks (G6), auto-fill (G7), regenerate from a point (G8), swap in the plan (G9).~~ Done.
3. ~~Backup and restore (B1–B3).~~ Done.
4. Stats: full per-game stats (S3), season stats (S4), CSV export (S5).
5. Light theme (D10), editable positions (P1), archive and copy teams (M1, M4).

## Small changes requested

- [x] **Team screen tab order:** Games, Roster, Settings, opening on Games. Games is what she uses most; the roster rarely changes once it's set. (Requested 2026-11-03.)
- [x] **Consistent on-court order:** on Game Day (and wherever a lineup is listed), show players grouped Guards, then Forwards, then Centers, alphabetical by name within each group, so the order doesn't shuffle between segments when nobody is subbed. Seen in a 5-player test where the same five reordered every segment. (Requested 2026-11-03.)
- [x] **Teams screen layout:** put space between the list of teams and the "New team name" field; keep the team list at the top and pin the add-a-team field to the bottom of the screen. (Requested 2026-11-03.)
- [x] **Teams screen add field (minor, later):** change the button text from "Add team" back to "Add", and make sure the placeholder "New team name, e.g. 8U Thunder" fits in the text box without being cut off. (Requested 2026-11-03.)
