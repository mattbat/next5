# Hardening plan (2026-11-12)

From the 2026-11-12 repo review. Nine work packages (WP0–WP8), each written so one agent can do it without the others' context. Nothing here is built yet.

**Not in this plan:** a Game Day clock (decided against; the decisions log already says the app has no game clock), `npm audit fix` for the dev-only advisories, and moving the app off `mattbat.com/next5/` (WP0 only documents that risk).

## How to hand this out

Give an agent this file and one package number. Each package lists its files, what to build, the tests and what "done" means.

| Wave | Packages | Notes |
|---|---|---|
| 0 | WP0 (docs) | Goes first, alone. It creates the requirement IDs and the STATUS rows the others flip. |
| 1 | WP1, WP2, WP3, WP4, WP5 | Can run at the same time: their source files don't overlap. |
| 2 | WP6, WP7, WP8 | Start after WP1 has merged (WP7 edits `SettingsScreen.tsx`, which WP1 also touches). They can run at the same time; WP7 and WP8 both edit `src/help/topics.tsx`, in different topics. |

Every package also changes one row of `docs/STATUS.md`, so expect a one-line merge conflict there when two land close together. Keep both rows.

| Package | Kind | How it merges |
|---|---|---|
| WP0 | docs | `no-changelog` label; merge after CI passes |
| WP1, WP2, WP3 | fix | merge after `npm run check` and CI pass |
| WP5 | tooling | `no-changelog` label; merge after CI passes |
| WP4, WP6, WP7, WP8 | feature, or needs an iPhone check | **draft** pull request; wait for Matt to try the Cloudflare beta preview |

## Rules for every package

These repeat `CLAUDE.md`; read that file too.

- One branch and one pull request per package, cut from `main`: `claude/<package-slug>`. Each agent works in its own worktree.
- `npm run check` must pass before committing. It takes several minutes; run it in the background.
- Add a changelog note in `changes/<slug>.md` (format in `changes/README.md`), in a coach's words. WP0 and WP5 use the `no-changelog` label instead.
- Flip your row in `docs/STATUS.md` (the "Hardening" table WP0 adds) from ⬜ to ✅, with a one-line note, in the same change.
- Don't bump the version or run a release. That is a separate pull request, and Matt chooses the bump.
- Screens write data only through `src/data/repo.ts`. Don't touch `src/engine` (it stays pure). Don't edit an existing Dexie `version(n)`; no package here needs a schema change.
- Made-up player names only. The repo is public.
- On Windows, edit files with the Edit/Write tools, never PowerShell `Set-Content`.
- If something in a package turns out to be wrong about the code (a field name, a file), trust the code, do the sensible thing and say so in the pull request description.

---

## WP0. Docs: requirement IDs, status table, drift

**Branch:** `claude/hardening-docs` · **Files:** `REQUIREMENTS.md`, `docs/STATUS.md`, `README.md`

1. **REQUIREMENTS.md**: add these rows.
   - In §11 "Data and backup":
     - **B6**: "Diagnostics shows whether the phone has promised to keep next5's data (storage protection). When it hasn't, the backup reminder comes after 14 days instead of 30."
     - **B7**: "Before a restore changes anything, offer to back up what's on this phone first ('Back up this phone, then restore' or 'Restore without a backup'). Not asked when the phone has no teams or a backup was made in the last day. If the backup is cancelled, nothing is restored."
   - In "Sharing a game with an assistant": **SH7**: "The share sheet says that a shared game includes player names and skill levels, and that anyone with the link or file can read them."
   - A new subsection "Hardening (added 2026-11-12)" after §11's tables, with:
     - **SEC1**: A backup or shared game is saved only if every record is complete and sane: required fields present, text and lists within limits, timestamps not in the future, and a shared game's players belong to its team.
     - **SEC2**: Files and links that are far too big to be real are turned away before they're read in full.
     - **SEC3**: If a screen crashes, the app shows a recovery screen (go to Teams, reload, back up) instead of a blank page.
     - **SEC4**: Exported CSV cells can never be read as spreadsheet formulas.
     - **SEC5**: The built app carries a Content-Security-Policy that allows only its own files and blocks every outside connection (enforces N4).
     - **SEC6**: CI jobs run with read-only permissions unless they deploy; actions are pinned to commits.
2. **Decisions log (§17)**: add a 2026-11-12 row: the review's hardening items SEC1–SEC6 and B6, B7, SH7 are accepted; a Game Day clock stays out (see 2026-11-02).
3. **Risks (§19)**: add "**Shared web address:** next5 is served from `mattbat.com/next5/`, so any other page on `mattbat.com` can read its saved teams. Don't host anything there that runs other people's scripts or content. Moving next5 to its own subdomain would isolate it but strand the data on phones that already use it, so it stays."
4. **README.md** developer section: one sentence with the same warning, near the deploy notes.
5. **docs/STATUS.md**:
   - Add a "Hardening (2026-11-12)" table with rows SEC1–SEC6, B6, B7, SH7, all ⬜, each naming its package (e.g. "WP1").
   - Fix the drift. The header says 0.2.1 is live and "Last updated: 2026-11-05"; §11a says practice planning is "waiting to be tried on the beta preview". Check `CHANGELOG.md` and `git log` for what has actually shipped (0.4.0 is released and includes practice planning) and correct the header, §11a's intro, REL2's note and the "Proposed next milestones" list. Leave 📱 marks alone: only Matt knows what he has checked on an iPhone.

**Done when:** the IDs above exist in both files, the STATUS header matches `package.json` and `CHANGELOG.md`, and CI passes with the `no-changelog` label.

---

## WP1. Imports: required fields, limits, cross-checks, size caps (SEC1, SEC2)

**Branch:** `claude/import-validation` · **Changelog:** `fixed`
**Files:** `src/data/validate.ts`, `src/data/handoff.ts`, `src/data/backup.ts`, `src/data/repo.ts` (`receiveGame` only), `src/screens/TeamsScreen.tsx` and `src/screens/SettingsScreen.tsx` (file size check only), and their tests.

### The problem (confirmed by test on 2026-11-12)

`shape()` in `validate.ts` checks a field only when it is present. So these all parse as valid today:

- a backup of `teams: [{id}]`, `players: [{id}]`, `games: [{id}]`
- a shared game of `team: {id}`, `players: []`, `game: {id, teamId}`
- a shared game whose team name is 100,000 characters, whose `updatedAt` is `9e15`, whose player has a different `teamId` from the team, whose `warnings` is `[{message: {a: 1}}]` and whose `events` has `kind: 'nonsense'`

A game saved without `plan` or `format` then throws wherever a screen reads `game.plan.length` (for example `gamePath` in `src/router.ts`, used by the team's game list).

### What to build

1. **Required and optional fields.** Give `shape` two field lists: required (must be present and pass) and optional (checked when present). Validation runs *after* `upgradeGameV2` / `upgradeGameV3`, so fields those fill in count as required.
   - Every record: `id` (string), `createdAt`, `updatedAt` (timestamps, see 3).
   - Team: `name`, `positions`, `requirement`, `defaultFormat`, `defaultRules`, `archived`. Optional: `alwaysBring`.
   - Player: `teamId`, `name`, `number`, `skills`, `active`.
   - Game: `teamId`, `date`, `opponent`, `attending`, `format`, `rules`, `plan`, `warnings`, `seed`, `status`, `current`, `played`, `subbedOut`, `statuses`, `events`, `locks`. Optional: `startPlan`, `handoff`, `lastChange`.
   - Drill: `name`, `minutes`, `court`, `tags`, `equipment`, `notes`, `retired`. Optional: `starter`.
   - Practice: everything in the `Practice` type except `lastRun`. Block: `id`, `minutes`, `stations`, `skipped`; optional `actualSeconds`.
   - **Check before trusting this list:** the migration tests write version 1 and 2 databases. Any field missing from a v1 record that no `upgrade` fills in must stay optional, or old backups will be refused. The existing "backups from older versions" tests must still pass unchanged.
2. **Limits.** Add a `text(max)` check and give every list and record a maximum. Suggested: ids 100 characters; names, opponent, jersey number, coach, tags and equipment items 200; notes and other long text 5,000; `attending` and scrimmage teams 100 players; `locks` 500; `events` 1,000; `warnings` 200; record keys (`skills`, `requirement`, `statuses`) 100; in a shared game, 100 players; in a backup, 10,000 of each record type. The exact numbers matter less than every field having one. `date` must match `yyyy-mm-dd`; a practice `time` is `''` or `hh:mm`.
3. **Timestamps.** `createdAt` and `updatedAt` must be finite, not negative, and no more than 24 hours ahead of this phone's clock. **Reject, don't clamp:** `decideReceive` recognises a link opened twice by comparing `updatedAt` values, and two phones' clocks differ by seconds, so changing the value on the way in would break that. Same rule for `handoff.sentAt` and `clock.startedAt`.
4. **Warnings and events by kind.** Replace `listOf(isObject)` and the loose `isEvent` with checks that match the `Warning` type (`src/engine/types.ts`) and the `GameEvent` type (`src/data/types.ts`) variant by variant. An unknown `kind` is refused. Add a comment on both types: adding a kind means raising `HANDOFF_VERSION` and `BACKUP_VERSION`, so older apps say "update the app" instead of "damaged".
5. **Cross-checks in `parseHandoff`.** Every player's `teamId` must equal the team's id. In `receiveGame` (`repo.ts`), don't overwrite a player this phone already has under a *different* team.
6. **Size caps.**
   - `decodeHandoff`: read the unzipped stream with a reader and stop with the "damaged link" message once it passes 1 MB. Don't buffer the whole thing first.
   - `dataFromText`: return `null` for pasted text longer than 200,000 characters.
   - File pickers: before `file.text()`, refuse a game file over 1 MB and a backup over 20 MB, with "This file is too big to be a next5 game." / "…backup."
7. **Messages** stay as they are ("This game is damaged and can't be opened…", "This backup is damaged and can't be restored."). Don't name the field: coaches can't act on it.

### Tests

- `validate.test.ts`: for each record type, a table test that removing each required field, one at a time, is refused; each limit has a just-under and a just-over case; future timestamps; each warning and event kind, plus an unknown one; a player on another team.
- A property test (fast-check): start from what the app itself saves (the `demo()` helper), replace one random field at any depth with `fc.anything()`, and assert the parsers never throw. For anything they accept, assert every required field is still present with the right type.
- A round trip: `createBackup` → `parseBackup` and `makeHandoff` → `encodeHandoff` → `decodeHandoff` still succeed for a planned, a live and a finished game, and for a practice mid-run.
- `handoff.test.ts`: a link that unzips past the cap is refused (build one from a long run of repeated characters).
- Screen tests: an oversized file shows the message and saves nothing.

**Done when:** the three examples under "The problem" are refused, old-version backups still restore, and `npm run check` passes.

---

## WP2. Crash recovery screen (SEC3)

**Branch:** `claude/crash-recovery` · **Changelog:** `improved`
**Files:** new `src/components/ErrorBoundary.tsx` and test, `src/main.tsx`, `src/styles.css`.

Today nothing catches a render error, so React unmounts everything, including `ErrorBanner`, and the coach sees a blank page.

1. Add a class component `ErrorBoundary` and wrap only `<App />` with it in `main.tsx`. `UpdateBanner`, `WhatsNewSheet` and `ErrorBanner` stay outside so they keep working.
2. Fallback screen, in the app's usual `screen` layout:
   - "Something went wrong on this screen." and the error's message in small text.
   - **Go to Teams**: `navigate(paths.teams())` and clear the error.
   - **Reload**: `window.location.reload()`.
   - **Back up all teams**: calls `backUp()` from `src/data/backup.ts` and shows its result. This is the important one: it works even when a bad record breaks a screen.
   - A link to Diagnostics.
3. Clear the error on `hashchange`, so the phone's back gesture also recovers.
4. In `componentDidCatch`, call `logError` (`src/errorLog.ts`) so Diagnostics shows it.

**Tests:** a child that throws shows the fallback; changing the hash shows the app again; Back up calls `backUp`; `logError` is called. Silence React's expected console error in the test.

**Done when:** a thrown render error on any route leaves a usable recovery screen, and `npm run check` passes.

---

## WP3. CSV cells can't be formulas (SEC4)

**Branch:** `claude/csv-formulas` · **Changelog:** `fixed`
**Files:** `src/domain/stats.ts`, `src/domain/stats.test.ts`.

`field()` quotes cells but leaves a leading `=` alone. A player named `=HYPERLINK("http://x","y")` (which can arrive in a shared game) exports as a live formula (confirmed by test on 2026-11-12).

- In `field()`, when the value is a **string** that starts with `=`, `+`, `-`, `@`, tab or carriage return, put a `'` in front, then quote as now. Leave numbers alone.
- Tests: each of those first characters; a normal name is unchanged; a name with a comma or quote is still quoted correctly; the numeric columns are unchanged.

**Done when:** no string cell in either CSV export can start with those characters, and `npm run check` passes.

---

## WP4. Content-Security-Policy (SEC5)

**Branch:** `claude/csp` · **Changelog:** `improved` ("next5 now blocks every connection to other websites, as a second lock on 'your data stays on your phone'.") · **Draft pull request: needs the beta preview on an iPhone.**
**Files:** `vite.config.ts`, a new e2e test, possibly `index.html`.

GitHub Pages can't send headers, so the policy goes in a `<meta http-equiv="Content-Security-Policy">` tag.

1. Add it **at build time only** (a `transformIndexHtml` hook with `apply: 'build'`, like the existing `betaPage` plugin). The dev server needs inline scripts and a websocket, so it gets no policy.
2. The inline theme script in `index.html` must keep working. Compute its SHA-256 in the hook from the script's exact text and put `'sha256-…'` in `script-src`. Don't use `'unsafe-inline'` for scripts. Fail the build if the hook can't find exactly one inline script, so a later edit can't silently break the theme.
3. Starting policy; adjust only as far as the tests force you to, and say why in the pull request:

   ```
   default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self';
   manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
   ```

   `style-src` needs `'unsafe-inline'` because React sets `style` attributes. `frame-ancestors` does nothing in a meta tag; leave it out.
4. After `npx vite build`, read `dist/index.html` and check nothing else injects an inline script (vite-plugin-pwa can, depending on how the service worker is registered). If it does, switch to the non-inline registration rather than loosening the policy.
5. The beta build runs the same hook; check the tag is in a `BETA=1` build too.

**Tests:**
- A new e2e spec against the built app: collect `securitypolicyviolation` events and console errors while walking the main flow (teams → plan → game day → final → share sheet → settings → help, and a practice with the timer and its beep), in both themes. Expect none.
- In the same spec, `fetch('https://example.com')` from the page is blocked.
- The existing offline spec still passes (service worker and precache work under the policy).

**Needs checking on an iPhone (beta preview):** the app opens from the Home Screen with the right theme and no flash; **Update** still works; sharing a file, exporting CSV and backing up still open the share sheet; the practice beep still plays.

**Done when:** the built `index.html` has the policy, the e2e spec is clean, `npm run check` passes, and the draft pull request lists the iPhone checks above.

---

## WP5. CI permissions and pinning (SEC6)

**Branch:** `claude/ci-hardening` · **Label:** `no-changelog`
**Files:** `.github/workflows/ci.yml` only.

1. Add top-level `permissions: contents: read`. The `deploy` job keeps its own block (`contents: write`, `pages: write`, `id-token: write`).
2. Stop pasting GitHub values into shell text. Pass them through `env:` and use the shell variable:
   - `changelog` job: `BASE_REF: ${{ github.base_ref }}` → `node scripts/release.mjs --check "origin/$BASE_REF"`
   - `release` job: `BEFORE: ${{ github.event.before }}` → `--released "$BEFORE"`
3. Pin every `uses:` to a full commit SHA with the version in a comment, e.g. `actions/checkout@<sha> # v5.x.y`. Look each one up, don't guess: `gh api repos/actions/checkout/git/ref/tags/<tag>` (follow annotated tags to the commit). Add a comment at the top of the file saying how to update a pin.
4. Change nothing else about what the jobs do.

**Checks:** the pull request's own CI run exercises `test`, `changelog` and `e2e`. The `release` and `deploy` jobs only run on `main`, so they can't be proven before merging; say so in the pull request, and re-read those two jobs line by line against the old file. The first release after this merges is the real test.

**Done when:** CI is green on the pull request and the diff contains only the three kinds of change above.

---

## WP6. Storage protection status (B6)

**Branch:** `claude/storage-protection` · **Changelog:** `new` · **Draft pull request.**
**Files:** `src/data/db.ts`, `src/data/backup.ts`, `src/screens/DiagnosticsScreen.tsx`, `src/screens/TeamsScreen.tsx`, `src/help/topics.tsx` (backup topic), tests. Don't touch `SettingsScreen.tsx` (WP7 has it).

`requestPersistentStorage()` asks the phone to keep next5's data, and `main.tsx` throws the answer away. A coach using next5 in a Safari tab (not from the Home Screen) can lose everything after a few weeks without opening it, and nothing says so.

1. `db.ts`: add `storageProtected(): Promise<boolean | null>` using `navigator.storage.persisted()`; `null` when the phone can't say. Keep `requestPersistentStorage` as it is.
2. **Diagnostics:** a row "Storage protected" with "yes", "no" or "unknown". The rows are built synchronously today; load this one in an effect.
3. **Backup reminder:** `backupReminderDue` takes a third argument, `protectedStorage` (default `true`). When it is exactly `false`, the reminder is due after 14 days instead of 30 (`REMIND_AFTER_UNPROTECTED_DAYS`). `null` counts as protected, so phones that can't answer aren't nagged.
4. **Teams screen:** read `storageProtected()` once and pass it in. When it is `false`, the reminder adds one sentence: "This phone hasn't promised to keep next5's data, so a backup matters more." If it is `false` and the app isn't running from the Home Screen (`isStandalone()` in `src/viewport.ts`), add: "Adding next5 to your Home Screen helps."
5. **Help → backups:** one short paragraph explaining the Diagnostics row.

**Tests:** `backup.test.ts` for the 14 and 30 day cases and `null`; a Teams screen test for the extra sentence; a Diagnostics test for each of the three values (mock `navigator.storage`).

**Needs checking on an iPhone:** what the row says in Safari and from the Home Screen.

**Done when:** the row shows, the reminder timing follows it, and `npm run check` passes.

---

## WP7. Safety copy before restore (B7)

**Branch:** `claude/backup-before-restore` · **Changelog:** `new` · **Draft pull request.** Start after WP1 merges.
**Files:** `src/screens/SettingsScreen.tsx` and its test, `src/help/topics.tsx` (backup topic), `e2e/backup.spec.ts`.

A restore can't be undone. **Replace everything** deletes what's on the phone; **Merge** overwrites any record the backup has a newer copy of.

1. After the coach taps **Merge into this phone** or **Replace everything** (and, for Replace, after the existing confirmation), if this phone has at least one team and `backedUpRecently()` is false, show a step with two buttons and a cancel link:
   - **Back up this phone, then restore**: calls `backUp()`. If the backup was cancelled, restore nothing and say "Backup cancelled. Nothing was restored." Otherwise run the restore.
   - **Restore without a backup**: runs the restore.
   - **Cancel**: back to the summary.
2. Tell a cancelled backup from a finished one the way `onErase` in the same file does (compare `lastBackupAt()` before and after), or better, have `backUp` usable in a way that reports the outcome without changing its return text. Copy the wording and layout from the update flow (B5, `src/components/UpdateBanner.tsx`: "Back up, then update" / "Update without a backup") so the two feel the same.
3. Skip the step when the phone has no teams or a backup was made in the last day, exactly like B5.
4. **Help → backups:** add a sentence about the safety copy.

**Tests:** `SettingsScreen.test.tsx`: the step appears for Merge and Replace when there are teams; not with no teams; not after a recent backup; a cancelled backup restores nothing; each button's path ends in the right restore mode. Extend `e2e/backup.spec.ts` with the "Restore without a backup" path (the share sheet can't be driven in WebKit tests).

If the Settings help screenshot shows the restore section, retake it with `npm run screenshots` and commit only the images that really changed.

**Done when:** no restore can run on a phone with teams and no recent backup without the coach choosing one of the two buttons, and `npm run check` passes.

---

## WP8. Privacy note on the share sheet (SH7)

**Branch:** `claude/share-privacy-note` · **Changelog:** `improved` · **Draft pull request.**
**Files:** `src/screens/ShareGameSheet.tsx`, `src/help/topics.tsx` (share topic), `src/screens/Handoff.test.tsx`, `public/help/share-light.webp` and `share-dark.webp`.

A shared game carries the team, the attending players' names and their skill levels (decision 2026-11-03, needed for game-day re-plans). In a link they are packed, not encrypted: anyone who gets the link can read them. Nothing in the app says so.

1. In `ShareGameSheet`, add one `hint` line under the two buttons: "The link or file includes player names and skill levels. Send it only to someone who should see them." Keep it to one line's worth; the sheet must still fit an iPhone SE without scrolling (there are e2e size tests; check `e2e/gameday-fit.spec.ts` and the wide-font spec still pass).
2. **Help → sharing:** a short paragraph saying the same, plus that the link never reaches a web server (everything after `#` stays on the phone) and that sharing the plan *as text* never includes skill levels.
3. Retake the share sheet screenshots with `npm run screenshots`; commit only `share-light.webp` and `share-dark.webp` unless others truly changed.

**Tests:** the sheet shows the note for a planned, a live and a finished game.

**Done when:** the note shows on the sheet and in help, the screenshots match, and `npm run check` passes.

---

## After everything merges

- Propose a release with `npm run release`. WP6, WP7 and WP8 are new things a coach can see, so this is probably a minor bump: ask Matt.
- The first release run is also the first real test of WP5's `release` and `deploy` jobs. Watch it.
