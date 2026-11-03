# next5

**Fair basketball rotations, planned before the game and run with one tap during it.**

next5 is an iPhone app for youth basketball coaches. You enter your roster once. Before each game you mark who showed up, and next5 builds a rotation that gives everyone fair playing time and always has the positions you need on the court. During the game, the screen shows who is on the court, who comes **in**, who goes **out**, and what position each incoming player plays. Tap **Next** at each substitution.

- Works with no internet once installed. Everything is stored on your phone.
- Free: no App Store, no account, no subscription.

App: **https://mattbat.com/next5/**

---

## For coaches

### Install it on your iPhone

1. Open **https://mattbat.com/next5/** in **Safari**. Other browsers on iPhone can't install apps.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open next5 from the new icon on your Home Screen.

It opens full screen like any other app and works in gyms with no signal.

### Quick start

1. **Add your team.** Type a name (e.g. *8U Thunder*) and tap **Add**. To look around first, tap **Load demo team** instead; it adds a team of made-up players.
2. **Build your roster.** Tap **+ Add** for each player. Enter a name, a jersey number, and for each position they can play, a skill level:
   - **Rising**: still learning this position
   - **Steady**: comfortable and reliable here
   - **Go-To**: who you want here in a close game

   Skill levels appear only on this screen, never on game day.
3. **Set up the team once** on the **Settings** tab:
   - **Position requirement**: the minimum number of players who can play each position in every lineup. For example, *Guard 2* means at least two players who can play Guard are always on the court.
   - **Default game format**: quarters or halves, and how many lineups per period. The default is 2 per quarter, a sub at the middle and at the end of each quarter.
   - **Default rules**: see *How the rotation is built* below.
4. **Plan a game.** Teams open on the **Games** tab. Tap **+ New game**. Uncheck anyone who isn't coming, then tap **Generate plan**.
5. **Check the plan.** The grid shows each player (rows) for each lineup (columns). A letter is the position they cover; an empty cell is the bench. The **#** column is their total. Tap **↻ Shuffle** for a different plan that is just as fair.
6. **Start the game.** Tap **Start game**. At each substitution, read the green **▲ IN** and red **▼ OUT** pairs, send the players in, and tap **Next**. Tapped Next by mistake? Tap **↶ Undo**.
7. After the last lineup tap **End game** to see everyone's playing time. The game is saved in the team's history.

The screen stays awake during a game. If the phone locks anyway, or you switch apps, next5 picks up exactly where you left off.

### When the game doesn't go to plan

- **Sub someone out right now:** tap the player in the **On court** list, then **Sub out now**, and pick who goes in. Both players get credit for that segment.
- **Send in someone else at the next sub:** tap a green **▲ IN** player and pick a replacement. Only the next lineup changes.
- **Injury, or a player leaves:** tap the player, then **Injured or leaving**. If they're on the court, pick who replaces them now. They're out for the rest of the game.
- **Give someone a rest:** tap the player, then **Rest for 1, 2 or 3 segments**.
- **Late arrival:** tap **Edit** (top right) → **Show players not here** → tap the player → **Arrived**. They can play from the next segment.
- **Re-plan:** after any of these, next5 offers to re-plan the rest of the game. A preview shows exactly which lineups change (new players in green) before you tap **Use new plan**. Segments already played never change, and it moves as few players as possible. If you keep the old plan, a yellow banner reminds you while someone who can't play is still in an upcoming lineup.
- **Overtime:** on the last segment, tap **+ OT** (or **Edit → Add overtime segment**) to add another lineup, planned with the same rules.

Every change is listed under **Changes from the plan** in the game summary.

When you pick a replacement, players who can play that spot's position are listed first, then everyone else, and each player shows the positions they play (G, F, C). If your pick breaks one of your rules (no one covering Center, uneven playing time, someone sitting too long), next5 tells you and you can tap **Swap anyway**. During a game you're always in charge; plans next5 generates still always cover your positions.

### How the rotation is built

Each rule can be turned on or off for the team, and changed for a single game:

| Rule | What it does |
|------|--------------|
| **Cover positions** | Every lineup meets the position requirement. This rule is never broken. If the players who showed up can't cover a position, next5 tells you what's missing. |
| **Equal playing time** | Everyone plays the same number of lineups, give or take one. |
| **Don't sit too long** | Players go back in as soon as the roster allows. With 10 or fewer players nobody sits twice in a row; with 11–15, nobody sits more than two in a row. |
| **Balance skill** | Avoids putting several Rising players on the court together, and spreads Go-To players across the game. |

When rules conflict, they win in this order: positions, equal time, don't sit too long, balance skill. If a rule has to give, the plan shows a **Heads up** note explaining exactly who is affected.

Playing time is counted in lineups, not minutes. The goal is best-effort fairness, not a stopwatch.

### Your data

Everything is saved on your phone as you go. There is no Save button. Your data is **lost if you delete the app from the Home Screen** or clear Safari's website data. A backup feature is coming (see [docs/STATUS.md](docs/STATUS.md)).

### Updates

When a new version is ready, a banner says **A new version of next5 is ready**. Tap **Update** when convenient; your teams and games are kept. The banner never appears during a live game.

---

## For developers

### Stack

- **React 19 + TypeScript** built with **Vite**
- **vite-plugin-pwa** (Workbox) for the service worker, offline caching and update prompts
- **Dexie** (IndexedDB) for on-device storage
- **Vitest** + **fast-check** + **Testing Library** for unit, property and component tests
- **Playwright** for end-to-end tests in WebKit at iPhone 17 size
- **GitHub Actions** for CI, deploying to **GitHub Pages**

### Getting started

You need Node 24 or later.

```bash
npm install
npm run dev          # http://localhost:5173/next5/
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build at http://localhost:4173/next5/ |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no output |
| `npm test` | Unit, property and component tests with coverage |
| `npm run test:e2e` | Playwright end-to-end tests (run `npm run build` first) |
| `npm run check` | Everything above, in CI order |
| `npm run icons` | Regenerate PNG icons from `public/favicon.svg` |

The first time you run e2e tests, install the browsers with `npx playwright install webkit chromium`.

To try a dev build on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the printed network address. Service workers need HTTPS, so offline mode and installing only work on the deployed site.

### Project layout

```
src/
  engine/       Rotation engine: pure TypeScript, no UI or storage
    generate.ts     builds plans
    analyze.ts      scores plans and produces warnings
    positions.ts    position coverage (bipartite matching) and assignment
    substitutions.ts  works out IN/OUT pairs between two lineups
  domain/       Game logic shared by screens: labels, Next/Undo, stats (game.ts)
                and game-day changes: swaps, statuses, re-plan, overtime (changes.ts)
  data/         Storage: Dexie schema (db.ts), the only module that writes (repo.ts)
  screens/      One component per screen
  components/   Shared UI (top bar, toggles, sheets, update banner, install hint)
  hooks/        useGameData, useWakeLock
e2e/            Playwright tests
docs/STATUS.md  Which requirements are done
REQUIREMENTS.md The spec
```

Routing uses the URL hash (`#/team/…`) because GitHub Pages can't serve `index.html` for deep links. The app lives under `/next5/`; that base path is set in `vite.config.ts`.

### How the rotation engine works

`generatePlan` (in `src/engine/generate.ts`) builds a plan one segment at a time. A segment is one lineup between substitutions.

1. **Validate.** Every segment needs at least 5 available players, and the available players must be able to cover the position requirement. Coverage is a bipartite match of distinct players to required slots, so a player who can play Guard or Center can't count for both at once. If either check fails, the engine returns a typed error that the UI explains.
2. **Cost each player** for the next segment:
   - Players **behind on playing time** relative to their fair share are cheaper (R1). Fair share accounts for late arrivals and absences.
   - Players **on the bench longer** are cheaper.
   - **Benching** someone past the bench limit `⌈(players − 5) ÷ 5⌉` is expensive (R2).
   - Players in the **previous plan's** lineup are cheaper, so a re-plan makes as few changes as possible.
3. **Pick the lineup.** With no position or skill rules, the cheapest five win. Otherwise it tries combinations of the most-due players, skips any that can't cover positions (H1), adds a small penalty for stacking skill levels (R3), and widens the pool if nothing fits.
4. **Repeat with jitter.** It builds 40 candidate plans with a little random jitter and scores each whole plan with `analyzePlan`. The score is weighted by rule priority: equal time ≫ bench limit ≫ changes from the previous plan > skill balance. The best plan wins. A seed makes this repeatable; **Shuffle** just uses the next seed.

Segments in `fixed` (already played, or locked) are never changed. 15 players × 16 segments with positions takes well under a second.

### Tests

- `src/engine/*.test.ts`: example tests for every rule, error and edge case.
- `src/engine/generate.property.test.ts`: fast-check generates hundreds of random rosters, requirements, absences and fixed segments, and checks that positions are always covered, time stays within 1, bench stretches stay within the limit, played segments never change, and unavailable players never play.
- `src/App.test.tsx`: walks the main workflows through the real screens against an in-memory IndexedDB.
- `e2e/`: Playwright, in WebKit at 402×874 (iPhone 17) for the full game flow, and in Chromium for offline launch.

Coverage thresholds are enforced in `vite.config.ts`: 95% of lines for `src/engine`, 80% for the app.

### CI and deployment

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Lint, types, unit tests** (with coverage)
2. **End-to-end** (build, then Playwright)
3. **Deploy to GitHub Pages**: only on pushes to `main`, and only if both jobs above pass

Repository setting: **Settings → Pages → Source: GitHub Actions**.

### Changing stored data

The IndexedDB schema lives in `src/data/db.ts`. Never edit an existing `version(n)`. Add `version(n + 1)` with an `upgrade()` that migrates old records, and add a test for it. App updates must never lose a coach's data.
