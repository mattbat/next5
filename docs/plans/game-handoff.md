# Plan: hand a game between the coach and the assistant

Status: built on `feat/game-handoff` (2026-11-03). Two changes from this plan: Send uses two buttons (**Text a link** and **AirDrop a file**) instead of waiting on the iPhone spike, and the halftime **Send update** was left out because a send returns control to the coach.

## Goal

The coach plans a game, hands it to the assistant, the assistant runs the
swaps during the game, and the finished game ends up back on the coach's phone.
No backend: the game travels as a **link** (Messages, WhatsApp, email) or a
**file** (AirDrop, Files, iCloud Drive).

## The workflow

**Before the game: coach → assistant**

1. On the plan screen the coach taps **Send to assistant**. The share sheet
   opens. Messages gets the link; AirDrop gets the file.
2. The coach's copy shows "With assistant (sent 5:02 pm)". The coach can still
   edit the plan. Edits show "Changes not sent yet · Resend".
3. The assistant opens the link or file. The game is added, or it replaces
   their copy if they haven't started it yet.

**During the game**

4. The assistant runs the game as usual. On the coach's phone, **Start game**
   is replaced by "The assistant is running this game" and **Take back
   control**.
5. Optional: the assistant taps **Send update** at halftime so the coach can
   look.

**After the game: assistant → coach**

6. **End game** on the assistant's phone offers **Send back to coach**.
7. The coach opens it. It replaces the coach's copy and the coach is in charge
   again. Stats now include the game.

### Correction to the earlier chat

Without a backend, the coach's phone **can't know** when the assistant taps
Start. So the coach's phone can't switch itself to view-only at tip-off. The
rule is:

- While a game is handed off, the coach **can edit the plan** but **can't run
  the game** on their phone (only Take back control).
- The **assistant's phone** protects the live game: if a coach update arrives
  after the assistant has started, it's refused ("You've already started this
  game. Replacing it would lose your swaps.") with a **Replace anyway** option.

## How the receiving phone decides

Every send carries a **handoff number** (the sender's number + 1). Phone clocks
are never compared for games.

| On this phone | Incoming | Result |
|---|---|---|
| No copy of the game | anything | Add it. This phone is now in charge. |
| Copy, incoming number is higher, local game not started | from coach | Replace. "Updated plan from coach." |
| Copy, incoming number is higher, local game live or final | coach plan (not started) | Refuse, with **Replace anyway**. |
| Copy, incoming number is higher | from the phone we handed to | Replace. This phone is in charge again. |
| Copy, incoming number is the same | anything | Ask: "Keep yours or use theirs?" This happens after Take back control. |
| Copy, incoming number is lower | anything | Ignore: "You already have a newer copy." |

Take back control adds 1 to the local number. If the assistant later sends a
copy built on the old number, the numbers tie and the coach is asked.

The team and its players in the payload merge the way backups already do (the
newer `updatedAt` wins, nothing is deleted).

## What's in a link or file

```ts
interface GameHandoff {
  format: 'next5-game';
  version: 1;
  sentAt: string;          // ISO time, for display only
  handoff: number;         // handoff number, see above
  team: Team;
  players: Player[];       // the game's attending players
  game: Game;
}
```

- **Link:** `https://<pages>/next5/#/receive/<data>`, where `<data>` is
  gzip-compressed JSON (`CompressionStream`, Safari 16.4+) as base64url. The
  app already uses a hash router, so this is just a new route. The part after
  `#` is never sent to GitHub Pages, so roster names stay off the server.
- **File:** the same JSON, uncompressed, named like
  `next5-game-tigers-2026-11-08.json`.

**Skill levels:** the payload includes them, because the assistant's phone
needs them for re-plans and position coverage on game day. The app still never
shows them on game-day screens (P6), and backups already include them.
(Decided 2026-11-03. Add this to the REQUIREMENTS decisions log in step 8, and
note in P6 that game handoffs are an exception to "never in exports".)

## Receiving, and the Safari catch

On iPhone, a link opens in Safari, which keeps its own data, separate from the
home-screen app. The `#/receive/...` screen therefore offers:

- **Open here:** imports into this browser. This is fine for an assistant who
  never installed the app.
- **Copy for the next5 app:** copies the link. Then, in the installed app,
  **Paste game** on the Teams screen reads the clipboard (iOS asks once to
  allow the paste).

Files go in through **Open game file** on the Teams screen. That screen also
accepts backup files, so there's one button for "something someone sent me".

## Build steps

Each step lands with tests and keeps `npm run check` green.

1. **Payload and codec** (`src/data/handoff.ts`): build the payload from a game
   id; `encodeLink` / `decodeLink` (gzip + base64url); `parseHandoff` with the
   same validation and v2/v3 upgrades as `parseBackup`.
   - Tests: round trip, damaged and foreign input, newer-version message, and a
     **size budget** (a 12-player, 4×2 game finished with swaps, link under
     8 KB).
2. **Handoff state on the game.** Add an optional field to `Game`:
   `handoff?: { n: number; away: boolean; sentAt: number; unsent: boolean }`.
   It isn't indexed, so no new Dexie version is needed. Missing means "never
   handed off" (the same pattern as `startPlan` on the stats branch). If a
   schema change turns out to be needed, add `version(4)` with a migration
   test.
3. **Receive rules** (`receiveHandoff` in `src/data/repo.ts`): the table above
   as a pure decision function plus one Dexie transaction.
   - Tests: an example test for every row of the table, and a property test
     that an older copy never replaces a newer one.
4. **Send UI:** a **Send to assistant** / **Send back to coach** button. One
   `navigator.share({ url, files })` call if iOS shows both well. Otherwise
   two buttons, **Send link** and **Send file** (see open questions). Mark the
   game sent; edits after that set `unsent`.
5. **Receive UI:** a `receive` route and screen; **Paste game** and **Open game
   file** on the Teams screen; the result messages from the table.
6. **Game-day guard:** on a handed-off game, the coach's phone replaces Start
   with "The assistant is running this game" and **Take back control** (with a
   warning). **End game** on the receiving phone offers **Send back to coach**.
7. **End-to-end test** with two Playwright browser contexts: the coach plans
   and sends (with `navigator.share` mocked to capture the link), the assistant
   opens the link, starts, swaps and ends, sends back, and the coach pastes.
   The coach's stats show the swap. Also check that a late coach update is
   refused on the assistant's live game.
8. **Docs:** turn REQUIREMENTS §16 "Sharing and sync" into numbered
   requirements (e.g. SH1–SH6) plus a decisions-log entry; update
   `docs/STATUS.md`; add a "Sharing a game with your assistant" section to the
   coach README.

## Open questions to check on an iPhone first

A 30-minute spike before step 4:

- Does `navigator.share({ url, files })` give Messages a tappable link and
  AirDrop the file? Or does Messages attach the file too? This decides between
  one Send button and two.
- How long a link will Messages turn into a tappable link? The size budget in
  step 1 is a guess until this is checked.
- Does `navigator.clipboard.readText()` work in the home-screen app on a
  button tap?

## Later, not in this plan

Dropped on 2026-11-05: none of these will be built.

- **Pre-filled text:** save the assistant's number once in Settings and open
  `sms:<number>&body=<link>`, so the coach taps Send without picking a contact.
- **QR code** for in-person handoff with no signal. Needs a scanner library and
  a tighter payload.
- **A small mailbox** (Cloudflare Worker + KV) so the return trip happens on its
  own.

## Working alongside the stats branch

The stats work (`feat/stats`, uncommitted in the main checkout) changes files
this plan also touches: `src/data/types.ts`, `share.ts`, `backup.ts`,
`GameDayScreen.tsx`, `TeamScreen.tsx`, `styles.css` and `docs/STATUS.md`.
Start building **after stats is merged to `main`**, on a fresh branch from
`main`, so the two never conflict. Writing this plan touched only this file in
this worktree.
