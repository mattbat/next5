# next5: notes for Claude

iPhone PWA for planning and running youth basketball substitutions. The spec is in `REQUIREMENTS.md`; progress is tracked in `docs/STATUS.md`.

## Rules for every change

- Run `npm run check` (lint, type-check, unit tests with coverage, build, e2e) and make sure it passes before committing. Never commit failing work (Q-7).
- Update `docs/STATUS.md` in the same change that implements or alters a requirement.
- Add tests with every feature. The rotation engine (`src/engine`) needs example tests and, where a rule is involved, a property test.
- Keep the engine pure: no React, Dexie or DOM imports in `src/engine`.
- Screens write data only through `src/data/repo.ts`. For quick edits use `updateGame` (partial update), not `saveGame`, so fast taps can't overwrite each other.
- Never edit an existing Dexie `version(n)`. Add a new version with a migration and a test.
- Use made-up player names only. The repo is public.
- On Windows, edit files with the Edit/Write tools, not PowerShell `Set-Content` (it mangles UTF-8 characters like · — ↶).
