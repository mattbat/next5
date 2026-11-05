// Pure helpers for releases and the changelog (REQUIREMENTS.md REL1–REL4).
// scripts/release.mjs does the file and git work; these are unit tested.

export const NOTE_TYPES = ['new', 'improved', 'fixed'];
export const TYPE_HEADINGS = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
export const BUMPS = ['patch', 'minor', 'major'];

/**
 * Reads one changelog note: a `type:` line between --- markers, then one or
 * two lines for a coach. Returns { type, text } or throws with what's wrong.
 */
export function parseNote(source, file = 'note') {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(source.trim() + '\n');
  if (!match) throw new Error(`${file}: start with a --- block holding "type: new", "type: improved" or "type: fixed".`);
  const type = /^type:\s*(\w+)/m.exec(match[1])?.[1];
  if (!NOTE_TYPES.includes(type)) throw new Error(`${file}: type must be one of ${NOTE_TYPES.join(', ')}.`);
  const text = match[2].trim().replace(/\s*\r?\n\s*/g, ' ');
  if (!text) throw new Error(`${file}: add a line saying what changed, in words a coach would use.`);
  return { type, text };
}

/** "1.2.3" → [1, 2, 3]. */
export function parseVersion(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!parts) throw new Error(`Not a version: ${version}`);
  return parts.slice(1).map(Number);
}

export function nextVersion(current, bump) {
  const [major, minor, patch] = parseVersion(current);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Bump must be one of ${BUMPS.join(', ')}.`);
}

/** Negative, zero or positive, like a sort comparison. */
export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * The bump to propose: minor when anything is new, otherwise patch. Major is
 * never proposed; that's always the user's call.
 */
export function suggestBump(notes) {
  return notes.some((n) => n.type === 'new') ? 'minor' : 'patch';
}

/** Notes grouped by type, in the order New, Improved, Fixed. */
export function groupNotes(notes) {
  const groups = {};
  for (const type of NOTE_TYPES) {
    const items = notes.filter((n) => n.type === type).map((n) => n.text);
    if (items.length > 0) groups[type] = items;
  }
  return groups;
}

/** One release's section for CHANGELOG.md. */
export function renderSection(version, date, notes) {
  const groups = groupNotes(notes);
  const lines = [`## ${version} (${date})`, ''];
  for (const [type, items] of Object.entries(groups)) {
    lines.push(`### ${TYPE_HEADINGS[type]}`, '', ...items.map((t) => `- ${t}`), '');
  }
  return lines.join('\n');
}

/** Adds a release's section to CHANGELOG.md, newest first, below the intro. */
export function addToChangelog(changelog, section) {
  const at = changelog.search(/^## /m);
  if (at === -1) return `${changelog.trimEnd()}\n\n${section}`;
  return `${changelog.slice(0, at)}${section}\n${changelog.slice(at)}`;
}

/** A release's section body from CHANGELOG.md, for the GitHub release notes. */
export function sectionFor(changelog, version) {
  const start = changelog.search(new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm'));
  if (start === -1) return null;
  const rest = changelog.slice(start);
  const end = rest.slice(3).search(/^## /m);
  return (end === -1 ? rest : rest.slice(0, end + 3)).trim();
}

/** The entry the app shows under What's new (src/changelog.json). */
export function releaseEntry(version, date, notes) {
  return { version, date, ...groupNotes(notes) };
}

/**
 * Checks a pull request (CI). `changed` lists the files it changes.
 * - A release (the version went up) must have a changelog section and app
 *   entry for it, and use up every note.
 * - Any other change to the app needs a changelog note, unless `skip` (the
 *   no-changelog label, for tests, docs or tooling only).
 * Returns a list of problems; empty means it's fine.
 */
export function checkPullRequest({ baseVersion, version, changed, changelog, entries, notesLeft, skip }) {
  const problems = [];
  const order = compareVersions(version, baseVersion);
  if (order < 0) problems.push(`The version went down, from ${baseVersion} to ${version}.`);
  if (order > 0) {
    if (!sectionFor(changelog, version)) problems.push(`CHANGELOG.md has no "## ${version}" section.`);
    if (entries[0]?.version !== version) problems.push(`src/changelog.json doesn't start with ${version}.`);
    if (notesLeft > 0) problems.push(`${notesLeft} changelog note(s) in changes/ weren't included in the release.`);
    return problems;
  }
  const appChanged = changed.some((f) => /^(src|public|index\.html)/.test(f) && !/\.test\.tsx?$/.test(f));
  const noteAdded = changed.some((f) => /^changes\/(?!README).+\.md$/.test(f));
  if (appChanged && !noteAdded && !skip) {
    problems.push('This changes the app but adds no changelog note. Add one in changes/ (see changes/README.md), or label the PR no-changelog if coaches won’t notice it.');
  }
  return problems;
}
