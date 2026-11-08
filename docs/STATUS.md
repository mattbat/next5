# Implementation status

Tracks every requirement in [REQUIREMENTS.md](../REQUIREMENTS.md). Update this file in the same change that implements something.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started · ➖ Dropped · 📱 Needs checking on a real iPhone

**Done:** MVP 1 (plan and run a game), game-day changes, backup and restore, plan editing (G5a–G9), stats with CSV export (S3–S5), handing a game to an assistant (SH1–SH6), a light theme (D10), archiving teams (M1), in-app help with a first-run intro and screenshots (H-1, H-3, H-8), the 2026-11-04 code review fixes, and releases with a changelog (REL1–REL4; 0.2.1 is live). Everything left in the spec is done or dropped. **Next:** nothing planned; see "Proposed next milestones" at the bottom of this file for parked ideas.

Last updated: 2026-11-05 (iPhone checks done, docs refreshed)

## 3. Platform and technical

| ID | Status | Notes |
|----|--------|-------|
| T1 | ✅ | Installable PWA with a manifest, icons and standalone display. Installed and used on an iPhone (2026-11-03). |
| T2 | ✅ | No App Store or developer account. |
| T3 | ✅ | Deploys to GitHub Pages only when a release raises the version (REL2), and only after every CI job passes. Running the workflow by hand redeploys `main`. |
| T4 | ✅ | `/next5/` base path and hash routing. |
| T5 | ✅ | Workbox precaches the app. Offline launch is tested in Chromium; WebKit's test browser can't drive service workers. |
| T6 | ✅ | IndexedDB through Dexie, with `navigator.storage.persist()` requested at startup. |
| T7 | ✅ | Schema v2 adds game-day fields and v3 adds planning locks, each with an `upgrade()` migration. Tests write v1 and v2 databases and check they open under v3 with nothing lost. Backups from older versions get the same upgrade on restore. |
| T8 | ✅ | "Update available" banner, hidden during a live game, with an hourly update check. Follows navigation: hidden on every screen of a game in progress (Game Day, its plan, its setup), shown again after (2026-11-04). |
| T9 | ✅ | React, TypeScript, Vite, vite-plugin-pwa, Dexie. |
| T10 | ✅ | Tested in WebKit at five phone sizes and on an iPhone 16 Pro (Home Screen app). |

## 4–5. Core concepts and rules

| ID | Status | Notes |
|----|--------|-------|
| Quarters / halves, segments per period | ✅ | Defaults: quarters × 2, halves × 4. |
| Overtime / extra segments | ✅ | See D11. |
| H1 Position coverage | ✅ | Always enforced in generated plans. During a game, a coach-picked swap that leaves a position uncovered is allowed after a warning (decision 2026-11-03). When coverage is impossible the app explains what's missing. The one-tap "for this game only" fixes were dropped (decision 2026-11-03). |
| R1 Equal playing time | ✅ | Includes fair share for absences. |
| R2 Don't sit too long | ✅ | Limit is ⌈(players − 5) ÷ 5⌉. |
| R3 Balance skill | ✅ | Off by default. The generator and the warning both judge a player at the position they’re shown at (2026-11-04). |
| Rule priority and plain-language warnings | ✅ | |
| Fewest changes | ✅ | Used by re-plan (D6) and by every plan edit (G7). |

## 6. Positions and skill levels

| ID | Status | Notes |
|----|--------|-------|
| P1 | ✅ | Guard, Forward and Center per team. Editing the list was dropped (decision 2026-11-03): the three defaults are enough. |
| P2 | ✅ | |
| P3 | ✅ | Rising, Steady and Go-To. |
| P4 | ✅ | Steppers on the team's Settings tab. |
| P5 | ✅ | Positions are assigned by best skill. |
| P6 | ✅ | Skill levels appear only in the player editor. |

## 7. Teams and season setup

| ID | Status | Notes |
|----|--------|-------|
| M1 | ✅ | Create, rename, archive and delete. A team's Settings tab → **Archive team** hides it from the Teams list and keeps its players, games and stats; the Teams screen's **Show archived teams** lists them. An archived team opens as usual with an "Archived" banner and **Unarchive**, and **+ New game** is hidden until it's unarchived. Uses the existing `archived` field, so the schema didn't change. |
| M2 | ✅ | New games start from the team's defaults. |
| M3 | ✅ | Add players, mark them inactive, edit positions and skill. Past games keep their lineups. Adding a player with a name already on the roster warns and suggests a last initial. |
| M4 | ➖ | Dropped (decision 2026-11-03): teams are mostly new each season. |

## 8. Pregame planning

| ID | Status | Notes |
|----|--------|-------|
| G1 | ✅ | Date, opponent and attendance. |
| G2 | ✅ | |
| G3 | ✅ | |
| G4 | ✅ | Generate, and Shuffle for a new seed. |
| G5 | ✅ | The **Grid** view: players × segments with positions and totals, plus "Heads up" warnings. Warnings are listed above the grid rather than highlighted in it. Locked cells are ringed (in) or show ✕ (out). Tapping a column opens that segment. **Share plan as text** below the grid sends every lineup (with jersey numbers and positions, never skill levels) and each player’s total to Messages, Notes or Print. |
| G5a | ✅ | The Plan screen opens on **Segments**: ‹ › to step, and a Q1–Q4 strip to jump to any segment (a dot marks segments with locks). Each segment shows the five with positions, then the bench. Swipe to step is not built. |
| G6 | ✅ | Tap a player → **Lock in** / **Lock out** / **Unlock**; **🔒 Lock lineup** locks the whole five (e.g. a closing lineup). Locks are stored on the game (schema v3), shown as 🔒 In / 🔒 Out, kept by Shuffle, Redo from here, and game-day re-plan and overtime. A player's game-day status wins over a lock-in. A player's locks are dropped when they stop attending. |
| G7 | ✅ | Automatic: every lock or swap re-fills the plan right away with the fewest changes, and says which other lineups changed (with Undo). If the locks make the plan impossible, the edit is refused and the message names the segment and the position or count that fails. Rules the locks break (e.g. a long bench stretch) show as warnings. Decision 2026-11-03: there's no separate "Fill around locks" button, because filling happens on every edit. |
| G8 | ✅ | **↻ Shuffle** regenerates the whole plan, and **↻ Redo from here** regenerates from the current segment on. Both keep every lock; Redo also keeps the earlier segments. Decision 2026-11-03: "Redo from here" makes a new shuffle for the rest of the game, because the fewest-changes version of it would return the same plan (edits already re-fill with fewest changes). |
| G9 | ✅ | Tap a court player → **Swap with someone on the bench** (players who can play the open position are listed first), or tap a bench player → **Put in for someone**. The swap is kept as locks, so later edits don't undo it. Swaps that leave a required position uncovered are blocked; swaps that break other rules warn first ("Swap anyway"). |
| G10 | ✅ | Everything saves immediately. |
| G11 | ➖ | Dropped (decision 2026-11-03). New games already start with every active player attending and the team's default format and rules. |

## 9. Game day

| ID | Status | Notes |
|----|--------|-------|
| Main screen | ✅ | Period label, progress bar, on-court list with positions, IN/OUT pairs with position, and a large Next button. The screen is one viewport tall: rows keep their normal size when they fit and shrink a little when they don't (e.g. 5 in / 5 out), so it never scrolls. Tested from iPhone SE in Safari (375×548) up to Pro Max (440×956). **Edit → See full plan** opens the whole plan read-only, at the segment on the court ("On court now"); back returns to the game. |
| D1 | ✅ | |
| D2 | ✅ | **↶ Undo** takes back the last game-day change (sub out now, a change to the next sub, injured, rest, available again, arrived, re-plan, overtime), including both players’ credit for a mid-segment sub; with no change since Next, it takes back Next. One level; the change is saved with the game (`lastChange`, unindexed, so the schema didn’t change) so Undo works after a reload. Holding the button shows what it will undo. |
| D3 | ✅ | Played segments are passed to the engine as `fixed`. |
| D4 | ✅ | Tap a player on the court → Sub out now; both players are credited for the segment. Tap an incoming player to send in someone else instead. The replacement list shows players who can play the open position first, with every player's positions (G, F, C). A swap that breaks any rule warns first ("Swap anyway"); it is never blocked. Sending in someone else for the next lineup is kept as locks (in for the new player, out for the other), like a plan swap, so a later re-plan keeps it. |
| D5 | ✅ | Injured / out for the game, rest for 1–3 segments, available again, and late arrival (adds a non-attending player). Takes effect from the next segment. |
| D6 | ✅ | Offered after every status change, from the Edit menu, and from a banner when the plan still includes someone who can't play. Preview shows which lineups change before accepting. Locks can't be changed on game day, so when a segment's locks no longer work (e.g. the player swapped in is now injured) the re-plan drops that segment's locks instead of failing, and the preview says which segments. |
| D7 | ✅ | Screen Wake Lock, re-acquired when the app returns to the foreground. Works on the deployed (https) site, checked on an iPhone (2026-11-05); the Wi-Fi test link can't use it. When the phone can’t or won’t keep the screen on, the Plan screen (before tip-off) and the Game Day Edit menu say so and suggest Auto-Lock → Never. |
| D8 | ✅ | Tested by reloading mid-game. |
| D9 | ✅ | End game, and "Undo end of game" to resume. **Edit → End game now** (with confirmation) ends early when time runs out: the segment on the court counts as played, the rest of the plan isn’t recorded, and the Final screen’s Plan column counts only up to there. |
| D10 | ✅ | Dark by default; Settings → **Appearance**: Dark, Light or Match phone (follows the phone switching live). The light palette darkens the accent and IN/OUT/warning colors so text keeps 4.5:1 contrast on white. IN/OUT are shown by words and arrows in both. The theme is applied by an inline script in `index.html` before the app loads, so it never flashes the other one. Needs checking on an iPhone: the Home Screen app's status bar (clock, battery) switches to dark text on light only when the app is next opened. |
| D11 | ✅ | "+ OT" on the last segment and "Add overtime segment" in the Edit menu, planned with the same rules. |

## 10. History and stats

| ID | Status | Notes |
|----|--------|-------|
| S1 | ✅ | Each game stores its setup, plan, the plan as it stood at the start (`startPlan`), played lineups (including mid-segment swaps) and a log of every change. Games started before `startPlan` was added use their final plan instead. |
| S2 | ✅ | Games tab lists games with their status; finished games open their summary, including "Changes from the plan". |
| S3 | ✅ | The Final screen shows a table per player: Plan (the plan at the start), Played, Sat, and Positions (e.g. "G 3 · F 1"). Played below plan is highlighted. Players subbed out partway through a segment get credit for it. Segments a player was injured, resting or not yet there aren't counted as sat. Positions now show as chips with counts (2026-11-04, see D1 below). |
| S4 | ✅ | New **Stats** tab on the team (tabs are Games, Roster, Stats, Settings). One row per active player, plus inactive players who played: games, segments played, % of available segments played, and segments by position. Counts finished games only. |
| S5 | ✅ | **Export stats (CSV)** on the Final screen and **Export season stats (CSV)** on the Stats tab, through the share sheet (download where sharing isn't available). Files are UTF-8 with a byte-order mark and CRLF line endings, so Excel opens names with accents correctly. Skill levels are never included. |
| S6 | ➖ | Dropped (decision 2026-11-03): segments and % are enough. |

## 11. Data and backup

| ID | Status | Notes |
|----|--------|-------|
| B1 | ✅ | Settings → **Back up all teams**, or a team's Settings tab → **Back up this team**. Opens the iOS share sheet (Files, iCloud Drive, AirDrop); downloads the file where sharing isn't available. |
| B2 | ✅ | Settings → **Restore from a backup file** shows what's in it, then **Merge** (adds what's missing; the more recently changed copy wins; deletes nothing) or **Replace everything** (after confirming). Bad files are explained and change nothing. Backups from older versions are upgraded on restore. Files are checked field by field before anything changes; a damaged or made-up file is turned away (C4). **Replace everything** names any teams on this phone that aren’t in the backup and would be deleted. |
| B3 | ✅ | Teams screen reminder when there's a team and no backup, or the last one is over 30 days old. **Later** snoozes it for a week. |
| B4 | ✅ | Settings shows the version, links to Diagnostics, and has **Check for updates** (the app also checks hourly). |
| B5 | ✅ | **Update** asks "Back up, then update" or "Update without a backup", unless there are no teams or a backup was made in the last day. If the backup is cancelled, nothing is updated. |

### Sharing a game with an assistant

| ID | Status | Notes |
|----|--------|-------|
| SH1 | ✅ | **Share game** on the plan screen (any status), in the Game Day **Edit** menu, and on the Final screen → **Text a link** or **AirDrop a file**. Links are gzip + base64url after `#/receive/` (plain JSON where iOS can't compress); a finished 12-player game stays under 8 KB. Where sharing isn't available the link is copied, or the file downloads. Link sharing checked on iPhones from the deployed site (2026-11-03). |
| SH2 | ✅ | All three uses are covered by tests: re-sharing a changed plan, handing a game in progress back (end-to-end), and sharing a finished game for the records. |
| SH3 | ✅ | `#/receive/…` "Shared game" screen saying what opening it does (run it, take over from a segment, or add a finished game to the season), with **Open here** and, in Safari, **Copy for the next5 app**. Teams screen → **Receive a shared game**: **Paste game**, **Open game file** (a backup file is turned away with a pointer to Settings). Paste checked in the Home Screen app (2026-11-03). Shared games are checked for damage like backups, and show friendly dates (e.g. “Sat, Nov 7”). |
| SH4 | ✅ | `decideReceive` in `src/data/handoff.ts`, with an example test per case and property tests that an older copy never wins and played segments are never dropped silently. Team and players merge like a backup restore. |
| SH5 | ✅ | "Shared with the other phone" callout and **Share again** in place of **Start game** for a planned game; a locked read-only view with **Take back control** for a game in progress; "changed since you shared it" from `updatedAt > sentAt`. Sharing a finished game leaves it in charge here. |
| SH6 | ✅ | **Shared** badge in the game list while the other phone runs the game. |

The handoff state is an optional, unindexed `handoff` field on games, so the Dexie schema didn't change. A two-browser end-to-end test (`e2e/handoff.spec.ts`) covers coach → assistant by link, a refused late update, and the assistant handing the game in progress back by file for the coach to finish.

## 11a. Practice planning

Built on branch `claude/practice-planning` (2026-11-07), waiting to be tried on the beta preview (REL5) before it merges. 📱 means not yet checked on an iPhone.

| ID | Status | Notes |
|----|--------|-------|
| PR1 | ✅ 📱 | Team → **Practice** tab (`src/screens/PracticeTab.tsx`), between Games and Roster. The Roster tab lost its player count to make room; the count moved to its **Players (n)** heading. `createPractice` in `repo.ts`. |
| PR2 | ✅ 📱 | `#/drills` (`DrillsScreen`, `DrillSheet`): search, tag filter, suggested and custom tags, equipment, coaching points, retire and bring back. A drill a practice uses can't be deleted (`deleteDrill` returns false) and the sheet suggests retiring it. |
| PR3 | ✅ | 20 drills in `src/data/starterDrills.ts`, each with a stable `key`; `addStarterDrills` only adds missing ones. Written for review; any can be cut. |
| PR4 | ✅ 📱 | `PracticeScreen`: blocks with a minutes stepper, ↑/↓, Skip, Remove and **+ Station**; coach label and group (All/A/B) per station; total vs target; full-court note; start time, target length, focus and parent note. While running, only blocks still to come can change. Every edit goes through `editPractice` (read-modify-write in a transaction). |
| PR5 | ✅ | `splitTeams` in `src/domain/practice.ts`: balanced (best skill level, grouped by main position so two strong players at one position split up) or random; tap a player to move them. Property test: everyone on exactly one team, sizes within one, skill totals within 3. Skill levels are never shown. |
| PR6 | ✅ | `equipmentList`: always-bring list (team Settings → **Practice: always bring**; defaults in `DEFAULT_ALWAYS_BRING`) plus drill equipment, matched ignoring case, with the drills that need each item. |
| PR7 | ✅ 📱 | `#/practice/:id/run` (`PracticeRunScreen`): countdown, Pause/Resume, +1 min, Skip, Next/Finish, End; stations with coach, group players, coaching points; Up next. The clock is stored on the practice (`clock.startedAt` + `elapsed`), so it survives closing the app (e2e reloads mid-block). Beeps via Web Audio after the first tap (`src/practiceSound.ts`), with an on/off switch; wake lock as on Game Day. |
| PR8 | ✅ 📱 | 👍/👎 and a note per station, on the run screen and the review; **What went well** and **Work on next time**. Past notes show in the drill's editor (`drillNotes`). |
| PR9 | ✅ | Practice tab → **Season focus**: minutes and % by tag (with bars), and uses, minutes, last date and 👍/👎 by drill (`practiceStats`). Uses actual run time when known. |
| PR10 | ✅ 📱 | Share as text: full plan, a station card per named coach, and a parent one-pager (`practicePlanText`, `stationCardText`, `parentText`). |
| PR11 | ✅ | Optional `drills` and `practices` in backups (`BACKUP_VERSION` stays 1; older apps ignore them). Replace keeps the drill library when restoring a backup from before practices. Validated like games. Schema v4 adds the two tables; migration test from v3. |

Tests: `src/domain/practice.test.ts` (with a property test), `src/data/practice.test.ts`, `src/screens/Practice.test.tsx`, and `e2e/practice.spec.ts` (WebKit at 375×667 with a wide font). Help topic **Planning practices**.

## 12. Documentation and help

| ID | Status | Notes |
|----|--------|-------|
| H-1 | ✅ | The coach section of the README, now with screenshots and a pointer to the in-app guide. The screenshots are the same images the app uses (`public/help/`), taken by `npm run screenshots`, so they're easy to retake when screens change. |
| H-2 | ✅ | The developer section of the README, including how the engine works. |
| H-3 | ✅ | Six skippable intro cards on first open (only when there are no teams yet), with screenshots: what next5 does, the roster, generating a plan, swaps and locks, game day, and data on the phone. Swipe or Next/Back. The last card offers **Try the demo team**, **Set up my own team** and **Read the full guide**. Seen once per device; **Help → Replay the intro** shows it again; Skip or Done returns to the page it was replayed from, and help's Done then skips past the intro. Swiping checked on an iPhone (2026-11-05). |
| H-4 | ✅ | ⓘ explanations for rules, skill levels, the position requirement and the grid, plus **?** links to the matching help topic on the plan, game setup, roster, team rules, stats, the Game Day Edit menu, the share sheet, a received game, the Final screen and Settings → Back up. |
| H-5 | ✅ | Plain-language errors and warnings. |
| H-6 | ✅ | |
| H-7 | ✅ | |
| H-8 | ✅ | **Help** on the Teams screen (top left) and **Settings → Help and guide** open 16 topics in six groups: getting started (quick start, words next5 uses, installing, teams and players, team settings), before the game (planning, reading the plan, changing it, how the rotation is built), game day (running a game, when things change), after the game (summary and season stats), sharing and data (sharing with an assistant, backups, appearance and updates) and questions. Each topic has screenshots in the current theme (tap to enlarge) and Previous/Next links. **‹** goes back one page, like Safari’s back, and **Done** closes help, returning to the screen it was opened from however many topics were read. A team reopens on the tab you left it on (for this visit), so help opened from the Roster tab returns to the Roster tab. The 36 images (18 screens × 2 themes, WebP, about 1.2 MB) are precached, so help works offline. Needs reading through on an iPhone. |

## 13–14. Design, quality and tests

| ID | Status | Notes |
|----|--------|-------|
| Design and UX | ✅ | Dark sports theme with a light option, safe areas, 44pt+ tap targets, no horizontal scrolling (tested). Pinch and double-tap zoom are turned off (2026-11-05): the viewport tag, `touch-action` on the page, and cancelling iOS gesture events (unit tested; needs checking on an iPhone). A full accessibility pass (Dynamic Type, VoiceOver) was dropped (decision 2026-11-05); the existing labels stay. Home Screen icon redesigned (2026-11-04): option V2z, an orange 5 and a glass "next" chevron on a royal blue court. The other options are kept in `docs/icon/icon-options.html`. Needs checking on an iPhone after reinstalling from the Home Screen. Splash screen dropped (decision 2026-11-05): the app opens fast enough without one. Positions show as G / F / C chips wherever a position stands alone (Game Day, plan, bench, roster, stats, re-plan preview); VoiceOver reads the full name (2026-11-04). |
| N1 | ✅ | Opens straight away from the Home Screen, offline (checked on an iPhone 2026-11-05). |
| N2 | ✅ | Tested: well under 1 second (the test allows 3 seconds for CI). |
| N3 | ✅ | |
| N4 | ✅ | No analytics or network calls. |
| N5 | ✅ | README → "How the rotation engine works". |
| Q-1 | ✅ | `npm run check` runs everything. |
| Q-2 | ✅ | Example and property tests, plus a performance check. `src/domain/gameday.property.test.ts` runs random game-day action sequences (2026-11-04). |
| Q-3 | ✅ | Storage, migrations, backup and restore, game logic, game-day changes, plan editing, stats and CSV export, and screens are covered. |
| Q-4 | ✅ | WebKit at iPhone sizes: the full game flow (including stepping through the plan and a lock), adding players, an injury with re-plan and overtime, and Game Day fitting five screen sizes. Offline launch in Chromium. Data surviving an update is covered by the migration test (T7). |
| Q-5 | ✅ | Enforced: 95% for the engine and 80% overall. Currently about 100% and 97%. |
| Q-6 | ✅ | `.github/workflows/ci.yml`. Pull requests also need a changelog note (REL3); deploying happens on releases only (REL2). |
| Q-7 | ✅ | |

### Releases and changelog

| ID | Status | Notes |
|----|--------|-------|
| REL1 | ✅ | Semantic versions. `npm run release` lists waiting notes and suggests patch or minor; the user decides minor and major. |
| REL2 | ✅ | `npm run release -- <bump>` writes the release; merging its PR deploys, tags `vX.Y.Z` and publishes a GitHub release (`.github/workflows/ci.yml`). |
| REL3 | ✅ | Notes in `changes/`, checked in CI ("Changelog note" job; `no-changelog` label to skip). `CHANGELOG.md` and `src/changelog.json`; the app shows the notes once after an update and under Settings → What’s new. |
| REL4 | ✅ | Diagnostics shows the version and commit. |
| REL5 | 🟡 📱 | Beta builds when `CF_PAGES=1` (or `BETA=1`): `scripts/beta-lib.mjs` and `vite.config.ts` (base `/`, "next5 β", `noindex` and `robots.txt`); `src/beta.ts`; the Beta label in `TopBar`; Settings → Beta (branch, Erase beta data) and Coming next; Diagnostics → Channel. Cloudflare Pages project linked (2026-11-07). Still to check: a preview opening and installing on an iPhone. |

## 16. Stretch goals

➖ Dropped (decision 2026-11-05): favorite lineups, automatic cloud backup, and real sync. No server is wanted. Sharing a game between a coach and an assistant is done (SH1–SH6).

---

## Proposed next milestones

In priority order:

1. ~~Mid-game: swap now (D4), player status (D5), re-plan from here (D6), overtime and extra segments (D11).~~ Done.
2. ~~Planning: step through segments (G5a), manual lineups and locks (G6), auto-fill (G7), regenerate from a point (G8), swap in the plan (G9).~~ Done.
3. ~~Backup and restore (B1–B3).~~ Done.
4. ~~Stats: full per-game stats (S3), season stats (S4), CSV export (S5).~~ Done. Approximate minutes (S6) left for later (decision 2026-11-03).
5. ~~Light theme (D10)~~ Done. ~~Archive teams (M1)~~ Done. Editable positions (P1) and copying teams (M4) dropped (decision 2026-11-03).
6. ~~Hand a game to an assistant and back (SH1–SH6).~~ Done. Pre-filled text to a saved number, a QR code and an automatic return trip were dropped (decision 2026-11-05).
7. ~~Code review fixes (see `docs/plans/review-2026-11-04.md`) and releases with a changelog (REL1–REL4).~~ Done: 0.2.0 and 0.2.1 released.

Nothing else is planned. Dropped from the review (decision 2026-11-05): A1, a later player status overwriting an earlier one.

## Ideas to discuss

Ideas only. Nothing here is decided or built yet. (Added 2026-11-04.)

- ➖ **Download count:** dropped (decision 2026-11-05). N4 stays as it is: no analytics or tracking.

## Small changes requested

- [x] **Edit or delete a started game:** **Game setup** (opponent, date, Delete game) is reachable at any stage: plan → **Setup**, Game Day → **Edit** → **Game setup**, or the Final screen. Once the game has started, attendance, format and rules are hidden there, since they can't change. Deleting a started or finished game asks first and warns that its stats go too. (Requested 2026-11-03.)
- [x] **Team name in shared game files:** e.g. `next5-8u-thunder-game-2026-11-08-vs-tigers.json`, so files for several teams are easy to tell apart. (Requested 2026-11-03.)
- [x] **Team screen tab order:** Games, Roster, Settings, opening on Games. Stats was added after Roster on 2026-11-03: Games, Roster, Stats, Settings. Games is what she uses most; the roster rarely changes once it's set. (Requested 2026-11-03.)
- [x] **Consistent on-court order:** on Game Day (and wherever a lineup is listed), show players grouped Guards, then Forwards, then Centers, alphabetical by name within each group, so the order doesn't shuffle between segments when nobody is subbed. Seen in a 5-player test where the same five reordered every segment. (Requested 2026-11-03.)
- [x] **Teams screen layout:** put space between the list of teams and the "New team name" field; keep the team list at the top and pin the add-a-team field to the bottom of the screen. (Requested 2026-11-03.)
- [x] **"Something went wrong. Script error." banner when tapping Share in Safari:** a script that isn't next5's (Safari's Share sheet, or an extension) threw an error, which browsers report only as "Script error." with no details. The error banner now ignores those, and still shows next5's own errors. (Reported 2026-11-04.) Checked on an iPhone (2026-11-05).
- [x] **Top row looked a little blurry:** iOS draws a soft haze just below the clock and battery, and the top row (Help · next5 · Settings, Back, screen titles) sat inside it. next5 adds no blur itself. Every screen now starts 10px below the status bar instead of 4px. 16px was checked on an iPhone (sharp, but more space than needed), so it was trimmed to 10px. Game Day still fits one screen on every phone size tested. If it still looks soft, next steps: a solid top bar reaching up behind the status bar, then switching the status bar style to `default`. (Reported 2026-11-04.) Checked on an iPhone (2026-11-05).
- [x] **Update banner looked blurry:** pinned near the top, it was caught in the haze iOS draws under the clock and battery. It now sits near the bottom, just above each screen's own buttons. (Reported 2026-11-05.) Checked on an iPhone (2026-11-05).
- [x] **Update button did nothing until the app was force-closed:** after **Update**, the app waited for a signal from the phone that the new version had taken over, and in the iPhone Home Screen app that signal doesn't always come. It now reloads when the new version takes over, or after 3 seconds at most, and the button shows **Updating…**. Not caused by the help pages or intro. In Chrome the update worked both before and after the fix. The iPhone case can't be tested here (no Safari). (Reported 2026-11-04.) Checked on an iPhone (2026-11-05).
- [x] **Cleaner Teams screen:** removed the "Everything is saved on this phone. Version …" line from the bottom of the Teams screen. The version and the Diagnostics link are in Settings → App, and Diagnostics' Back button now returns to Settings. (Requested 2026-11-04.)
- [x] **Teams screen add field (minor, later):** change the button text from "Add team" back to "Add", and make sure the placeholder "New team name, e.g. 8U Thunder" fits in the text box without being cut off. (Requested 2026-11-03.)
