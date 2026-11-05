# Changelog notes

Every pull request that changes the app adds a note here: one file per change, named for it (for example `end-game-early.md`). CI fails a pull request that changes `src/`, `public/` or `index.html` without one, unless it has the `no-changelog` label (for changes coaches won't notice, like tests or tooling).

```markdown
---
type: new
---
End a game early: Edit → End game now.
```

- `type` is `new` (something a coach can now do), `improved` (works better or looks clearer) or `fixed` (a bug).
- Write one or two lines in plain words, as a coach would say them. They appear in the app under **What's new**.

`npm run release` lists the waiting notes and suggests a version. Making the release (`npm run release -- minor`, for example) moves them into `CHANGELOG.md` and `src/changelog.json` and deletes them here.
