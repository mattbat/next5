# next5 — Requirements

**Status:** Draft v0.3 · 2026-11-02
**Owner:** Matt
**Primary user:** A youth basketball coach (8U and 12U teams) using an iPhone on the sideline

---

## 1. Purpose

next5 is an iPhone app for planning and running youth basketball substitutions. Before the game, the coach picks who is attending and the app generates a fair rotation that covers the required positions. During the game, the coach works through the plan like a checklist: the screen always shows who comes out, who goes in, and what position each incoming player will play. A single tap moves to the next lineup.

Success means the coach never has to work out a rotation in her head or on paper during a game, every lineup on the court covers the positions it needs, and every player gets the playing time the team's rules promise.

## 2. Goals and non-goals

### Goals (v1)
- Manage several teams. Each team's roster is entered once and reused for every game.
- Record each player's eligible positions and a skill level at each position.
- Generate a rotation automatically from the attending players, the game format, the enabled scheduling rules, and the position requirements.
- Let the coach set specific lineups by hand and have the app fill in the rest.
- Regenerate either the whole plan or everything from a chosen point onward.
- Adjust during the game from the current point forward. Segments already played are never changed.
- Make game-day use one-handed and glanceable, with one tap to move to the next lineup. Who subs in, who subs out, and at what position is always unmistakable.
- Keep a history of every game, with playing-time stats per game and per season. Season stats can be exported.
- Work fully offline. No accounts and no backend.
- Document the app well, both in a README and with in-app explanations.

### Non-goals (v1)
- Running a game clock or tracking exact minutes.
- Tracking fouls, scores, or other box-score stats.
- Android or desktop-first layouts. These may work, but they are not designed for.

### Stretch goals (after v1)
~~Several coaches sharing a plan, syncing data across devices, and favorite lineups~~: dropped on 2026-11-05 (see §16 and the decisions log). Sharing a single game with an assistant is done (SH1–SH6).

## 3. Platform and technical constraints

| ID | Requirement |
|----|-------------|
| T1 | Delivered as a Progressive Web App (PWA) that is installed to the iPhone Home Screen and runs in standalone mode. |
| T2 | No Apple Developer Program membership, no App Store distribution, and no periodic reinstall. |
| T3 | Hosted on **GitHub Pages** as a static site. The CI pipeline deploys it when a release is made (see REL1–REL4), and only after every test passes (see §14). (Changed 2026-11-04: it used to deploy on every push to `main`.) On the free GitHub plan the repo must be public. That is acceptable because no user data lives in the repo or on the server. |
| T4 | Because GitHub Pages serves the app from a project subpath (`/next5/`), the manifest `start_url` and `scope`, the service worker scope, asset paths, and routing are all configured for that subpath. Routing uses hash-based URLs, because GitHub Pages can't fall back to `index.html` for other paths. |
| T5 | Works completely offline after the first load. All app files are cached by a service worker. |
| T6 | All data is stored on the device in IndexedDB. The app requests persistent storage (`navigator.storage.persist()`). |
| T7 | App updates never erase or corrupt saved data. Schema changes are handled with versioned migrations. |
| T8 | Updates are never applied silently. When a new version is downloaded, the app shows an "Update available" prompt, and the coach chooses when to apply it. The prompt is suppressed while a game is in progress. |
| T9 | Proposed stack: React + TypeScript + Vite, with `vite-plugin-pwa` (Workbox) for the service worker and Dexie for IndexedDB. |
| T10 | Target: current iOS Safari and the previous major version, in portrait orientation. |

## 4. Core concepts

- **Team:** a named team for one season (for example "8U Thunder — Winter 2026"). It holds the roster, the position setup, the default game format, and the default rules. (Copying a team into a new season was dropped on 2026-11-03; see M4.)
- **Player:** belongs to a team. Has a name, an optional jersey number, eligible positions, and a skill level at each of those positions (see §6).
- **Game:** a single game for a team. It records the date, opponent (optional), attending players, game format, enabled rules, the plan, and what actually happened.
- **Game format:** either **quarters (4)** or **halves (2)**, plus the number of **segments** per period. Defaults: quarters × 2 segments (a sub at the midpoint of each quarter and at each quarter break), or halves × 4 segments.
- **Segment:** the unit of rotation, meaning the stretch between two planned substitutions. Each segment has exactly 5 players on the court. All segments are treated as equal length. Example: quarters × 2 segments = 8 segments per game.
- **Overtime and extra segments:** overtime is simply more segments. Extra segments can be added to a game at any time (see D11).
- **Plan:** the ordered list of segments. Each segment has a lineup of 5, and each player in a lineup is assigned the position they are covering.
- **Playing time:** counted in segments, not minutes.

> The app does not keep time. The coach taps **Next** when the substitution actually happens, whether at a whistle, a timeout, or a period break.

> **Fairness is best effort.** Basketball is fluid. The app aims for fair playing time in segments, not exact minutes. It doesn't try to account for a segment that ran long, a mid-segment injury, or a late arrival beyond the simple rules in this document.

## 5. Scheduling rules

### Hard constraint (never broken)
| ID | Rule | Definition |
|----|------|-----------|
| H1 | **Position coverage** | Every lineup has to meet the team's position requirements (see §6). "At least 2 Guards" means the lineup contains at least 2 players marked as able to play Guard. One player can only count toward one position, so a lineup with 2 Guards and 1 Center needs 3 different players. The generator never produces a lineup that doesn't meet the requirements. A pregame edit that would leave a required position uncovered is blocked, with a message naming the missing position. **During a game, a substitution the coach picks is never blocked** (injuries may make an ideal lineup impossible): the app warns which position is uncovered and lets the coach go ahead. |

If the attending players *can't* cover the required positions (for example, nobody eligible to play Center showed up), the app stops before generating. It explains exactly what is missing and offers two fixes for this game only: make a player eligible for that position, or lower that position's requirement. (The one-tap fixes were dropped on 2026-11-03: the explanation is enough, and the coach can change attendance, a player's positions or the team's requirement.) Position coverage can be turned off entirely for a team, for example for 8U.

### Optional rules (independent toggles)
Each team has default settings for these rules, and each game can change them.

| ID | Rule | Definition |
|----|------|-----------|
| R1 | **Equal playing time** | Each attending player's total segments differ by at most 1. For players who arrive late or leave early, this is measured against the segments they were available for. |
| R2 | **Don't sit too long** | A player on the bench goes back in as soon as the roster allows. The longest allowed bench stretch is the shortest possible for the number of available players: **⌈(players − 5) ÷ 5⌉** segments in a row. That works out to 1 segment for 6–10 players (never sit twice in a row) and 2 segments for 11–15 players. Period breaks and halftime don't reset the count. |
| R3 | **Balance skill** | Avoid putting several players at the lowest skill level on the court together at their assigned positions. Spread players at the highest level across segments instead of bunching them together. |

**Priority when rules conflict:** H1 (never broken) > R1 > R2 > R3. When an optional rule can't be met, the generator still produces the best plan it can and tells the coach in plain language which rule was relaxed and where (for example, "Only 6 players: Sam sits twice in a row in Q3").

**Fewest changes:** whenever the app regenerates part of a plan that already exists (a re-plan, regenerating from a point, or auto-filling around manual edits), it keeps the coach's manual edits and changes as few of the remaining lineups as possible while meeting the rules. A single injury shouldn't reshuffle the whole rest of the game. A full "Regenerate entire plan" (G8) is the only action that starts from scratch.

The rule engine must be easy to extend so that more rules can be added later. Examples: "everyone plays in every period" or "player X and player Y not on the court together."

## 6. Positions and skill levels

| ID | Requirement |
|----|-------------|
| P1 | Each team has a list of positions: Guard / Forward / Center. (Editing the list, for example to PG / SG / SF / PF / C, was dropped on 2026-11-03.) |
| P2 | For each player, the coach picks which positions they can play. |
| P3 | For each position a player can play, the coach sets a skill level (see the table below). |
| P4 | Each team defines a **lineup requirement**: the minimum number of players needed at each position, for example "at least 2 Guards, at least 1 Center." |
| P5 | For display, the app gives each player in a lineup one position from the ones they can play, chosen so that the requirement is met. Where there is a choice, it prefers each player's highest skill level. This assigned position is what the Plan and Game Day screens show. |
| P6 | Skill levels appear only on the team and roster editing screens. They never appear on the Game Day screen, plan grids, stats, or exports, so they can't be seen over the coach's shoulder. The one exception is a game handed to the assistant (SH1), which carries them so the assistant's phone can re-plan; the app still never shows them there. |

### Skill level names
The names are encouraging and describe the player's role at that position, not how good they are:

| Level | Name | Meaning (shown in in-app help) |
|-------|------|------|
| 1 | **Rising** | Still learning this position |
| 2 | **Steady** | Comfortable and reliable here |
| 3 | **Go-To** | Who you want here in a close game |

*(Alternatives if these don't feel right: Warming Up / Game Ready / Closer, or Developing / Confident / Leader.)*

## 7. Teams and season setup

| ID | Requirement |
|----|-------------|
| M1 | Create, edit, archive, and delete teams. Several teams can be active at the same time. |
| M2 | Enter the roster, positions, lineup requirement, default format, and default rules once per team. Every new game for that team starts from these settings. |
| M3 | Edit the roster during the season: add players, mark a player inactive (keeping their history), or change positions and skill levels. Past games are not affected. |
| M4 | ~~Start a new season by copying a team.~~ Dropped 2026-11-03: teams are mostly new each season. |

## 8. Pregame planning

| ID | Requirement |
|----|-------------|
| G1 | Create a game for a team: set the date and opponent, and mark attendance (default: every active player attending). |
| G2 | Set the game format (quarters or halves, plus segments per period), starting from the team's defaults. |
| G3 | Enable or disable the optional rules for this game. |
| G4 | **Generate** a full plan. Regenerating may produce a different valid plan (shuffle). |
| G5 | **Review the plan** in a grid of players × segments. It shows who is on the court and at what position in each segment, and each player's total. Relaxed rules are highlighted. |
| G5a | **Step through the plan:** before a game, the coach can easily move segment by segment (previous / next, or jump straight to any segment) to see that segment's five with positions and its bench. Locks, swaps and "regenerate from here" (G6–G9) are done from this view. (Added 2026-11-03.) |
| G6 | **Manual lineups:** the coach can set an entire lineup for any segment by hand (for example, a "closing" lineup for the last segment), lock individual players into specific segments, or lock individual players out of them. Locked items are clearly marked. |
| G7 | **Auto-fill:** after setting lineups or locks by hand, the generator fills in every unlocked spot around them while still following the rules, and changes as little of the existing plan as possible (see "Fewest changes" in §5). If the locks make a rule impossible, the app says which one. |
| G8 | **Regenerate:** either regenerate the **whole plan** from scratch, or regenerate **from segment N onward** with as few changes as possible, keeping everything before N. Locked items are always kept. |
| G9 | **Swap:** swap any player into or out of any segment. Swaps that break optional rules show a warning but are allowed. Swaps that break position coverage (H1) are blocked. |
| G10 | Save the plan and come back to it later. Plans can be prepared days in advance. |
| G11 | ~~Duplicate a previous game's setup.~~ Dropped 2026-11-03: every new game starts with all active players attending and the team's default format and rules (M2), which is enough. |

## 9. Game day

### Main screen
Everything below is visible without scrolling on an iPhone in portrait:

- **Where we are:** for example "Q2 · Segment 2 of 2" and overall progress (segment 4 of 8).
- **On court now:** the 5 current players, each with the position they are covering.
- **Next change:** a list of substitution pairs, each showing ⬆ **IN** player → position ⬇ **OUT** player. For example: "IN #7 Maya [G] · OUT #12 Ava", where [G] is a position box (see the 2026-11-04 decision on position chips). Players staying on the court are listed separately and visually de-emphasized. If a staying player is switching positions, that is shown too.
- **Next** button: large and reachable with a thumb.

### Requirements
| ID | Requirement |
|----|-------------|
| D1 | Tapping **Next** moves to the next segment and records it as played. |
| D2 | **Undo** reverses the last Next tap. |
| D3 | **Played segments are locked.** No adjustment, swap, or regeneration ever changes a segment that has already been played. |
| D4 | **Swap now:** change the current lineup or any upcoming lineup. This records the change from the plan. When a swap happens partway through the current segment (for example, because of an injury), both the player who left and the player who came in are credited with that segment. The list of replacements shows players who can play the open spot's position first, then everyone else, with each player's positions (G, F, C). A swap that breaks any rule, including position coverage, shows a warning with **Swap anyway**; it is never blocked. |
| D5 | **Player status:** mark a player as *unavailable* (injured or left), *resting for the next N segments*, or *arrived* (for late arrivals). |
| D6 | **Re-plan from here:** regenerate the remaining segments, taking into account the segments already played and the current player statuses, so the rules hold for the game as a whole as far as possible. The re-plan keeps manual edits and changes as few lineups as possible (§5). The coach sees a preview that highlights what changed before accepting it. A status change (D5) offers a re-plan automatically. |
| D7 | The screen stays awake while a game is in progress (Screen Wake Lock API). |
| D8 | Leaving the app or locking the phone never loses game progress. On reopening, the app returns to the exact segment. |
| D9 | **End game:** finalize the game and its record, either after the last segment or early, when time runs out (only the segments played count). A game can be resumed if it was ended by mistake. |
| D10 | Readable in a bright gym from arm's length. Supports both light and dark appearance. OUT and IN are labeled with words and icons, not just color. |
| D11 | **Extra segments / overtime:** an "Add segments" action (for example "Overtime +1") adds new segments at the end of the game at any point. They are generated from the current state using the same rules, so fairness carries over from the rest of the game. When the coach taps Next on the last planned segment, the app offers either to add a segment or to end the game. |

## 10. Game history and stats

| ID | Requirement |
|----|-------------|
| S1 | Every game is stored permanently in the team's history: its setup, the original plan, what was actually played, and all changes made during the game. |
| S2 | A game list for each team shows upcoming, in-progress, and finished games. Any past game can be opened read-only. |
| S3 | **Per-game stats:** for each player, planned segments, segments actually played, segments sat, and positions played. |
| S4 | **Per-season stats:** for each player on the team, games attended, total segments played, percentage of available segments played, and segments by position. |
| S5 | **Export** season stats and per-game stats as CSV (opens in Excel, Numbers, or Google Sheets) through the iOS share sheet. Skill levels are never included (see P6). |
| S6 | Stats are counted in segments, with percentages. (Approximate minutes were dropped on 2026-11-03.) |

## 11. Data and backup

| ID | Requirement |
|----|-------------|
| B1 | Back up all data, or a single team, to a JSON file through the iOS share sheet (Files, AirDrop, Notes, email). |
| B2 | Restore from a backup file. Choose either *replace all* or *merge*. |
| B3 | Remind the coach to back up periodically, for example when no backup has been made in the last 30 days. |
| B4 | Settings shows the app version and has a manual "Check for updates" action. |
| B5 | Tapping **Update** offers a backup first ("Back up, then update" or "Update without a backup"). It isn't asked when there are no teams yet or a backup was made in the last day. |

> Data is lost if the app is deleted from the Home Screen or its website data is cleared. This is why B1 to B3 matter.

### Sharing a game with an assistant (added 2026-11-03)

The coach plans a game, an assistant can run the substitutions on their own phone, and either phone can share the game with the other at any point. There is no server.

| ID | Requirement |
|----|-------------|
| SH1 | **Share game at any point:** before, during or after the game, from the plan screen, the Game Day **Edit** menu or the Final screen. Share as a **link** (Messages, WhatsApp, email) or a **file** (AirDrop, Files). The game is packed into the link after the `#`, so it never reaches the web server. It includes the team and the attending players, with skill levels (see P6). The coach and assistant decide when to share. (Widened from fixed coach/assistant steps on 2026-11-03.) |
| SH2 | **Typical uses:** the coach shares the plan and shares again after changes; the assistant starts the game, has to leave, and shares the game in progress back for the coach to finish; the coach shares a finished game with an assistant who missed it, so their season stats are complete. |
| SH3 | **Receive:** opening a link shows what the game is, how far it has got, and **Open here**. In Safari, **Copy for the next5 app** copies it for the Home Screen app, which keeps its own data. The Teams screen has **Paste game** (a copied link) and **Open game file**. |
| SH4 | **No lost work:** every share carries a handoff number, and the receiving phone decides by it, never by the phones' clocks. A newer copy replaces the old one. The same or an older copy changes nothing. A copy with fewer segments played than this phone's is refused unless the user taps **Replace anyway**. When both phones changed the game since the last share, the user chooses which to keep. |
| SH5 | **One phone runs a game at a time:** after sharing a game that isn't finished, this phone shows "Shared with the other phone". A planned game can still be edited and **Shared again** (with a note when the plan changed since sharing), but not started. A game in progress is locked: no Next, swaps or other changes. **Take back control** (after confirming) lets this phone run it again. Sharing a finished game doesn't lock anything. |
| SH6 | The team's game list shows **Shared** for a game the other phone is running. |

## 12. Documentation and in-app help

| ID | Requirement |
|----|-------------|
| H-1 | **README for the coach:** what the app does, how to install it on iPhone (Safari → Share → Add to Home Screen), a quick-start walkthrough, how backups work, and how to get updates. Includes screenshots. |
| H-2 | **README for developers:** tech stack, project layout, local setup, running tests, how deployment to GitHub Pages works, and how the rotation generator works. |
| H-3 | **First-run guide:** a short skippable walkthrough the first time the app opens (create a team → add players → plan a game). |
| H-4 | **Inline explanations:** an ⓘ next to each rule, skill level, lock, and regenerate option, explaining it in one or two sentences. |
| H-5 | **Explaining the generator's choices:** whenever the generator relaxes a rule or blocks an edit, it says why in plain language and suggests how to fix it. |
| H-6 | **Empty states** that explain what to do next (for example, "No players yet. Tap + to add your roster."). |
| H-7 | **In-app install prompt:** when the app is opened in regular Safari rather than from the Home Screen, show how to add it to the Home Screen. |
| H-8 | **In-app guide:** a Help screen with a topic for each part of the app (setup, planning, game day, stats, sharing, backups, common questions), with screenshots that match the current theme and work offline. Screens link to the topic that explains them. |

## 13. Design and UX (iOS)

- **Target device: iPhone 17** (6.3-inch, about 402 pt wide) in portrait. Layouts must still work down to 375 pt wide and on Pro Max sizes, without horizontal scrolling.
- Respects safe areas (Dynamic Island, home indicator) and uses `viewport-fit=cover`.
- **Design direction:** a clean, modern sports look. A dark default theme suits gym use, with a light theme available. One bold accent color is used for actions, plus distinct IN (green ⬆) and OUT (red ⬇) treatments. Typography is large and confident, with jersey numbers prominent. Animations are subtle and quick: lineups slide on Next and players swap places. Nothing should feel like a generic web form. A mockup of the Game Day and Plan review screens is reviewed before the full build.
- Feels native to iOS: system font (SF Pro), iOS-style navigation and bottom sheets, and no accidental zoom, text selection, or pull-to-refresh on game-day screens.
- Tap targets of at least 44 pt. The main game-day actions sit within thumb reach.
- Every game-day action takes at most 2 taps. The Next action takes exactly 1.
- ~~Supports Dynamic Type sizes and VoiceOver labels.~~ Dropped 2026-11-05: the existing labels stay, but a full accessibility pass isn't planned.
- Polished, purpose-built feel, including a professionally designed Home Screen icon. (A splash screen was dropped on 2026-11-05: the app opens from the phone's cache fast enough not to need one.)
- Destructive actions (delete team, replace data) ask for confirmation.

## 14. Non-functional requirements

| ID | Requirement |
|----|-------------|
| N1 | Launches to a usable screen in under 2 seconds, offline. |
| N2 | Plan generation for up to 15 players and 16 segments ideally completes in under 1 second, and must complete within 3–5 seconds. |
| N3 | Every action is saved immediately. There is no "Save" button on the game day screen. |
| N4 | No analytics, tracking, or network calls beyond fetching app updates. |
| N5 | The rotation engine is documented in the developer README, with a plain-language explanation of how plans are scored. |

### Testing and CI

| ID | Requirement |
|----|-------------|
| Q-1 | **Automated tests for the whole app.** Every change must pass the full test suite before it is committed or deployed. |
| Q-2 | **Rotation engine (the highest priority):** the generator is pure TypeScript with no UI dependencies, so it can be tested in isolation. Its tests include: |
|     | • Example-based tests for each rule (H1, R1, R2, R3), locks, manual lineups with auto-fill, regenerating from a point, mid-game re-planning, status changes, extra segments, fewest changes, and every conflict message. |
|     | • **Property-based tests** (fast-check). These generate thousands of random rosters (6–15 players, random positions and skill levels, random locks, injuries, and late arrivals) and check that H1 always holds, that R1 and R2 hold whenever they are possible, that played segments never change, and that a re-plan never touches locked items. |
|     | • Performance check for N2. |
| Q-3 | **Unit and component tests** for data storage, migrations, backup and restore, stats calculation, and CSV export (Vitest + Testing Library). |
| Q-4 | **End-to-end tests** in WebKit (Safari's engine) at iPhone 17 viewport size using Playwright. They cover the main workflows: create a team → plan a game → run it with a swap, an injury re-plan, overtime, and undo → check the stats. They also check offline launch from the service worker cache and that saved data survives an app update. |
| Q-5 | **Coverage target:** at least 95% line coverage for the rotation engine and at least 80% for the app as a whole. The build fails if coverage drops below these. |
| Q-6 | **CI pipeline (GitHub Actions)** on every push and pull request: lint → type-check → unit and property tests → end-to-end tests → build. Deploying to Pages runs only on `main` after every earlier stage passes. All stages run with a single command locally as well (`npm test`, `npm run test:e2e`). |
| Q-7 | Claude runs the full test suite after every change and does not commit work that fails. |

### Releases and changelog (added 2026-11-04)

| ID | Requirement |
|----|-------------|
| REL1 | **Versions** are semantic, x.y.z. Patch (z): fixes, polish and internal changes. Minor (y): a new feature or requirement a coach would notice. Major (x): something a coach must act on or that breaks compatibility, such as a backup or shared-game format an older app can't read, or a removed feature. The version stays 0.x until v1 is declared done, then 1.0.0. Claude proposes a bump but always asks before minor or major. |
| REL2 | **Merging isn't releasing.** Work merges to `main` without reaching coaches. A release is its own pull request made with `npm run release -- minor` (or patch, or major); merging it deploys to GitHub Pages, tags `vX.Y.Z` and publishes a GitHub release. Running the CI workflow by hand redeploys `main` as it is. |
| REL3 | **Changelog:** every pull request that changes the app adds a short note for coaches in `changes/` (new, improved or fixed); CI fails one without a note unless it has the `no-changelog` label. A release collects the notes into `CHANGELOG.md` and `src/changelog.json`. The app shows them once after an update (never during a game or the first-run intro) and under Settings → What's new. |
| REL4 | Diagnostics shows the version and the commit it was built from. |

## 15. Screens (initial list)

1. **Teams:** list of teams (active and archived).
2. **Team:** roster, positions and skill levels, lineup requirement, default format and rules.
3. **Games:** upcoming, in-progress, and finished games for a team.
4. **Game setup:** date, opponent, attendance, format, rules.
5. **Plan review:** grid, warnings, manual lineups and locks, regenerate (all, or from a point).
6. **Game day:** main screen (§9) plus swap, status, re-plan, and undo.
7. **Game summary:** stats for that game.
8. **Season stats:** stats for each player, plus export.
9. **Settings:** backup and restore, updates, appearance, help, about.

## 16. Stretch goals

**Dropped on 2026-11-05:** favorite lineups, automatic cloud backup, and sync between coaches or devices. next5 stays serverless: backups are files and games are shared by link or file. The notes below are kept for reference only.

### Favorite lineups
- **Save a favorite:** mark any lineup of 5 as a favorite, from the plan grid, the Game Day screen, or a past game. It can optionally be named (for example "Closers" or "Press break") and its position assignments are saved with it.
- **Manage favorites:** each team has a list of favorites that can be renamed and deleted.
- **Use a favorite:** drop a favorite into any segment as a manual lineup (G6). The app checks that all 5 players are attending and available, and that the lineup still covers the required positions (H1).
- **Optional "Prefer favorites" rule:** the generator uses favorite lineups more often, as long as the higher-priority rules still hold (equal time, don't sit too long). This would be a new optional rule below R1 and R2.
- **Stats:** how many segments each favorite lineup has played this season.
- **Design implication for v1:** store lineups in a form that can be reused (a set of 5 player IDs plus their positions), so favorites can be added later without changing how plans are stored.

### Automatic cloud backup (first priority after the MVP)
- **Goal:** back up automatically with no manual steps. Every change syncs to the cloud while the app is open, and syncing catches up when the app goes back online after a gym with no signal.
- **iCloud isn't possible:** Apple's only web API for iCloud (CloudKit JS) needs a paid Apple Developer membership. iOS Safari also doesn't allow PWAs to write files in the background or sync while closed.
- **Leading option:** Firebase (Firestore) on the free plan, with a one-time sign-in. Firestore's built-in offline mode handles the gym case. The same setup also enables the sync and sharing goals below.
- **v1 preparation:** keep all storage access behind a single data layer so that the storage backend can be swapped or mirrored later.

### Sharing and sync
- **Cheapest step:** share a single game plan as a file that another coach imports. This needs no backend. Done for one coach and one assistant as SH1–SH6 (2026-11-03).
- **Real sync** across coaches or devices needs a backend. Options include the free tiers of Firebase, Supabase, or Cloudflare D1/KV. This conflicts with "no hosting costs" unless a free tier is enough.
- **Design implication for v1:** every record gets a stable unique ID and an `updatedAt` timestamp from the start, so a sync layer can be added later.

## 17. Decisions log

| Date | Decision |
|------|----------|
| 2026-11-02 | The app is a PWA, not a native iOS app. |
| 2026-11-02 | Substitutions advance when the coach taps "Next." The app has no game clock. |
| 2026-11-02 | The app generates rotations, and the coach can override them before and during the game. |
| 2026-11-02 | Position coverage is a hard constraint. Rule priority is equal time > don't sit too long > balance skill. |
| 2026-11-02 | The game format is quarters or halves, with a configurable number of segments per period. |
| 2026-11-02 | Hosting is on GitHub Pages. |
| 2026-11-02 | Fouls and scoring are out of scope. Sharing, sync, and favorite lineups are stretch goals. |
| 2026-11-02 | Automatic cloud backup and sync come after the MVP. iCloud is not possible for a PWA without a paid developer account. |
| 2026-11-02 | Re-plans and auto-fill keep manual edits and make as few changes as possible. |
| 2026-11-02 | Fairness is best effort and counted in segments. Every segment is equal length, and both players involved in a mid-segment swap are credited with it. |
| 2026-11-02 | A position requirement counts distinct players who are eligible for that position. |
| 2026-11-02 | The "sit" rule allows the shortest bench stretch possible for the roster size: ⌈(players − 5) ÷ 5⌉ segments in a row. |
| 2026-11-02 | Overtime means adding more segments. |
| 2026-11-02 | The target device is iPhone 17. |
| 2026-11-02 | The whole app has automated tests, with the rotation engine tested most thoroughly. The tests run in CI, and deploying requires them all to pass. |
| 2026-11-02 | CI and deployment run on GitHub Actions. The code, CI, and hosting all stay on GitHub. |
| 2026-11-03 | Coach and assistant share a game by text link or AirDrop file, without a backend (SH1–SH6). A small server "mailbox" for an automatic return trip may come later. |
| 2026-11-03 | A game sent to the assistant includes skill levels, because the assistant's phone needs them to re-plan. The app still never shows them on game-day screens. |
| 2026-11-03 | Dropped: copying a team into a new season (M4), duplicating a game's setup (G11), approximate minutes (S6), and one-tap position fixes (H1). Stretch goals (§16) wait. README screenshots (H-1) wait until the app is more polished. |
| 2026-11-03 | A game can be shared at any point (planned, in progress, or finished), not only at fixed coach and assistant steps. After sharing a game in progress, the sharing phone is locked until Take back control, so two phones never run the same game. |
| 2026-11-03 | Positions stay Guard / Forward / Center; editing the list (P1) is dropped. The three defaults are enough. |
| 2026-11-04 | The first-run guide (H-3) is a few skippable intro cards ending in "Try the demo team" or "Set up my own team", replayable from Help. A full in-app guide (H-8) is added, reached from the Teams screen, Settings and "?" links on screens. Screenshots are taken automatically from the demo team in both themes. |
| 2026-11-04 | Code review follow-ups. Positions are shown as G / F / C boxes wherever a position stands on its own (Game Day, the plan, the roster, stats); sentences, warnings and VoiceOver use the full words. A game can be ended early from the Game Day Edit menu (D9). The plan can be seen read-only during a game (Edit → See full plan) and shared as text. Sending in someone else at the next sub is kept as locks, and a re-plan drops locks that can no longer work instead of failing. Received backups and games are checked for damage before anything is saved. |
| 2026-11-05 | Dropped: a full accessibility pass (Dynamic Type and VoiceOver), a splash screen (the app opens fast enough without one), an install count, favorite lineups, and automatic cloud backup and sync. No server is wanted, so next5 stays fully on the phone (N4 is unchanged). |
| 2026-11-04 | Releases (REL1–REL4): semantic versions, chosen with the user; a changelog note in every pull request; deploys happen only on a release, not on every merge. |
| 2026-11-03 | During a game, coach-picked substitutions are never blocked. Breaking a rule, including position coverage, shows a warning and "Swap anyway". Generated plans still always cover positions. |

## 18. Open questions

| # | Question | Default assumption until decided |
|---|----------|----------------------------------|
| Q1 | Roster sizes for the 8U and 12U teams? | Typically 8–12. Design and test for 6–15 |
| Q2 | Should equal playing time balance across the season, so that players who got fewer segments last game get the extra segments next game? | Decided 2026-11-05: no. Each game is balanced on its own; the Stats tab shows who's been short so the coach can lock them in. |
| Q3 | Should position coverage be on for 8U? | Configurable per team |
| Q4 | Are some players restricted at the league level (for example a maximum number of segments)? | No |
| Q5 | Are the skill level names (Rising / Steady / Go-To) right? | Yes |
| Q6 | Should the optional "Balance skill" rule (R3) be included in v1? | Yes, off by default |
| Q7 | Does the remainder of the earlier handoff document (cut off at "NEXT LINEUP") contain more requirements? | Closed 2026-11-04: nothing more turned up; this document is the spec. |

## 19. Risks

- **Keeping the screen awake:** by default, an iPhone dims and locks after a short time without touches, which would be annoying mid-game. Web apps can ask iOS to keep the screen on (the Screen Wake Lock API), but in the past this has been unreliable for apps launched from the Home Screen on some iOS versions. Build a tiny test early and try it on the coach's iPhone 17. If it doesn't work, the fallback is to suggest setting Auto-Lock to "Never" during games.
- **iOS storage eviction:** iOS normally doesn't evict data for installed PWAs, but it can happen. The backup features (§11) are the safeguard.
- **Rotation generation with a hard position constraint, locks, and several soft rules** is a small constraint-satisfaction problem. Keep the generator isolated and well-tested, because it is the core of the app.
- **Public repo:** the code is visible to anyone. Don't commit real player names in test data or screenshots.
