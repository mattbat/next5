# Implementation status

Tracks every requirement in [REQUIREMENTS.md](../REQUIREMENTS.md). Update this file in the same change that implements something.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started · 📱 Needs checking on a real iPhone

**Current milestone:** MVP 1: plan a game and run it on game day. **Next:** MVP 2 (see the bottom of this file).

Last updated: 2026-11-02

## 3. Platform and technical

| ID | Status | Notes |
|----|--------|-------|
| T1 | ✅ 📱 | Installable PWA with a manifest, icons and standalone display. |
| T2 | ✅ | No App Store or developer account. |
| T3 | ✅ | Deploys to GitHub Pages from `main` only after every CI job passes. |
| T4 | ✅ | `/next5/` base path and hash routing. |
| T5 | ✅ | Workbox precaches the app. Offline launch is tested in Chromium; WebKit's test browser can't drive service workers. |
| T6 | ✅ | IndexedDB through Dexie, with `navigator.storage.persist()` requested at startup. |
| T7 | 🟡 | Schema v1, with the migration process documented in the README. There are no migrations yet and no test of data surviving an app update. |
| T8 | ✅ | "Update available" banner, hidden during a live game, with an hourly update check. |
| T9 | ✅ | React, TypeScript, Vite, vite-plugin-pwa, Dexie. |
| T10 | 🟡 📱 | Built and tested at iPhone 17 size in WebKit, but not yet on a real phone. |

## 4–5. Core concepts and rules

| ID | Status | Notes |
|----|--------|-------|
| Quarters / halves, segments per period | ✅ | Defaults: quarters × 2, halves × 4. |
| Overtime / extra segments | ⬜ | Labels support OT; the add-segment action is not built (D11). |
| H1 Position coverage | 🟡 | Enforced by the engine. When coverage is impossible the app explains what's missing, but it doesn't yet offer the one-tap "for this game only" fixes. Blocking manual edits arrives with manual edits (G9). |
| R1 Equal playing time | ✅ | Includes fair share for absences. |
| R2 Don't sit too long | ✅ | Limit is ⌈(players − 5) ÷ 5⌉. |
| R3 Balance skill | ✅ | Off by default. |
| Rule priority and plain-language warnings | ✅ | |
| Fewest changes | 🟡 | Supported by the engine (`previous`) and tested; not yet used by any screen (needs G7, G8 from a point, and D6). |

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
| G5 | ✅ | Players × segments grid with positions and totals, plus "Heads up" warnings. Warnings are listed above the grid rather than highlighted in it. |
| G6 | ⬜ | Manual lineups and locks. |
| G7 | ⬜ | Auto-fill around manual edits. The engine is ready. |
| G8 | 🟡 | Regenerating the whole plan works. Regenerating from segment N doesn't exist yet. |
| G9 | ⬜ | Swapping players in the plan. |
| G10 | ✅ | Everything saves immediately. |
| G11 | ⬜ | Duplicating a previous game's setup. |

## 9. Game day

| ID | Status | Notes |
|----|--------|-------|
| Main screen | ✅ | Period label, progress bar, on-court list with positions, IN/OUT pairs with position, and a large Next button. The screen is one viewport tall: rows keep their normal size when they fit and shrink a little when they don't (e.g. 5 in / 5 out), so it never scrolls. Tested from iPhone SE in Safari (375×548) up to Pro Max (440×956). |
| D1 | ✅ | |
| D2 | ✅ | |
| D3 | ✅ | Played segments are passed to the engine as `fixed`. |
| D4 | ⬜ | Swap now. |
| D5 | ⬜ | Player status (unavailable, resting, arrived). The engine supports `unavailable`. |
| D6 | ⬜ | Re-plan from here. The engine is ready. |
| D7 | ✅ 📱 | Screen Wake Lock, re-acquired when the app returns to the foreground. Needs checking on her iPhone. |
| D8 | ✅ | Tested by reloading mid-game. |
| D9 | ✅ | End game, and "Undo end of game" to resume. |
| D10 | 🟡 | High-contrast dark theme with IN/OUT shown by words and arrows. The light theme is not built. |
| D11 | ⬜ | Extra segments and overtime. |

## 10. History and stats

| ID | Status | Notes |
|----|--------|-------|
| S1 | 🟡 | Each game stores its setup, plan and played lineups. The change log arrives with D4–D6. |
| S2 | ✅ | Games tab lists games with their status; finished games open their summary. |
| S3 | 🟡 | The summary shows segments played per player. Planned segments, segments sat and positions played are not shown yet. |
| S4 | ⬜ | Season stats. |
| S5 | ⬜ | CSV export. |
| S6 | ⬜ | Approximate minutes. |

## 11. Data and backup

| ID | Status | Notes |
|----|--------|-------|
| B1 | ⬜ | Back up to a file. |
| B2 | ⬜ | Restore from a backup. |
| B3 | ⬜ | Backup reminder. |
| B4 | 🟡 | The version is shown on the Teams screen. There's no Settings screen or manual "Check for updates" yet; the app checks hourly on its own. |

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
| Q-3 | 🟡 | Storage, game logic and screens are covered. Backup and CSV tests will come with those features. |
| Q-4 | 🟡 | The full game flow and adding players are tested in WebKit at iPhone 17 size, and offline launch in Chromium. There's no test yet that data survives an app update. |
| Q-5 | ✅ | Enforced: 95% for the engine and 80% overall. Currently about 100% and 97%. |
| Q-6 | ✅ | `.github/workflows/ci.yml`. |
| Q-7 | ✅ | |

## 16. Stretch goals

All ⬜: favorite lineups, automatic cloud backup, sharing and sync.

---

## Proposed MVP 2

In priority order:

1. Mid-game: swap now (D4), player status (D5), re-plan from here (D6), overtime and extra segments (D11).
2. Planning: manual lineups and locks (G6), auto-fill (G7), regenerate from a point (G8), swap in the plan (G9).
3. Backup and restore (B1–B3).
4. Stats: full per-game stats (S3), season stats (S4), CSV export (S5).
5. Light theme (D10), editable positions (P1), archive and copy teams (M1, M4).
