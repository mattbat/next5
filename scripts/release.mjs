// Releases and the changelog (REQUIREMENTS.md REL1–REL4). See "Releases" in the README.
//
//   npm run release                 what's waiting to be released, and the bump it suggests
//   npm run release -- minor        make the release: patch, minor or major
//   node scripts/release.mjs --check <base>     CI: a pull request has a note, or is a complete release
//   node scripts/release.mjs --released <sha>   CI: prints the version if it changed since <sha>
//   node scripts/release.mjs --notes <version>  CI: that version's section of CHANGELOG.md
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  BUMPS,
  addToChangelog,
  checkPullRequest,
  compareVersions,
  nextVersion,
  parseNote,
  releaseEntry,
  renderSection,
  sectionFor,
  suggestBump,
} from './release-lib.mjs';

const NOTES_DIR = 'changes';
const read = (file) => readFileSync(file, 'utf8');
const readJson = (file) => JSON.parse(read(file));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function noteFiles() {
  return readdirSync(NOTES_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((f) => `${NOTES_DIR}/${f}`);
}

function notes() {
  return noteFiles().map((file) => ({ file, ...parseNote(read(file), file) }));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function versionAt(ref) {
  try {
    return JSON.parse(git('show', `${ref}:package.json`)).version;
  } catch {
    return null;
  }
}

function status() {
  const { version } = readJson('package.json');
  const pending = notes();
  if (pending.length === 0) {
    console.log(`next5 ${version}. Nothing is waiting to be released.`);
    return;
  }
  console.log(`next5 ${version}. Waiting to be released:`);
  for (const n of pending) console.log(`  [${n.type}] ${n.text}`);
  const bump = suggestBump(pending);
  console.log(`\nSuggested: ${bump} → ${nextVersion(version, bump)}`);
  console.log(`Options: ${BUMPS.map((b) => `${b} → ${nextVersion(version, b)}`).join(', ')}`);
}

function release(bump) {
  const pending = notes();
  if (pending.length === 0) throw new Error('There are no changelog notes in changes/, so there is nothing to release.');
  const pkg = readJson('package.json');
  const version = nextVersion(pkg.version, bump);
  const date = today();

  writeJson('package.json', { ...pkg, version });
  const lock = readJson('package-lock.json');
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson('package-lock.json', lock);
  writeFileSync('CHANGELOG.md', addToChangelog(read('CHANGELOG.md'), renderSection(version, date, pending)));
  writeJson('src/changelog.json', [releaseEntry(version, date, pending), ...readJson('src/changelog.json')]);
  for (const n of pending) rmSync(n.file);
  console.log(`Released ${version} with ${pending.length} change(s). Commit it as "Release ${version}" in its own pull request.`);
}

function check(base) {
  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const problems = checkPullRequest({
    baseVersion: versionAt(base) ?? readJson('package.json').version,
    version: readJson('package.json').version,
    changed,
    changelog: read('CHANGELOG.md'),
    entries: readJson('src/changelog.json'),
    notesLeft: noteFiles().length,
    skip: process.env.NO_CHANGELOG === 'true',
  });
  for (const n of noteFiles()) parseNote(read(n), n);
  if (problems.length > 0) {
    for (const p of problems) console.error(`✖ ${p}`);
    process.exitCode = 1;
  } else {
    console.log('✓ Changelog is in order.');
  }
}

/** Prints the version when this push raised it (a release to deploy), or nothing. */
function released(before) {
  const version = readJson('package.json').version;
  const previous = /^0+$/.test(before ?? '') ? null : versionAt(before);
  if (previous === null || compareVersions(version, previous) > 0) console.log(version);
}

function releaseNotes(version) {
  const section = sectionFor(read('CHANGELOG.md'), version);
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}.`);
  console.log(section.split('\n').slice(1).join('\n').trim());
}

const [arg, value] = process.argv.slice(2);
try {
  if (arg === undefined) status();
  else if (BUMPS.includes(arg)) release(arg);
  else if (arg === '--check') check(value ?? 'origin/main');
  else if (arg === '--released') released(value);
  else if (arg === '--notes') releaseNotes(value);
  else throw new Error(`Unknown option "${arg}". Use patch, minor, major, --check, --released or --notes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
