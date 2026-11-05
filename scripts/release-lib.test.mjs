import { describe, expect, it } from 'vitest';
import {
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

const note = (type, text) => `---\ntype: ${type}\n---\n${text}\n`;

describe('changelog notes', () => {
  it('reads the type and joins the text onto one line', () => {
    expect(parseNote(note('new', 'End a game early\nfrom the Edit menu.'))).toEqual({
      type: 'new',
      text: 'End a game early from the Edit menu.',
    });
    expect(parseNote('---\r\ntype: fixed\r\n---\r\nWindows line endings.\r\n')).toEqual({ type: 'fixed', text: 'Windows line endings.' });
  });

  it('explains a note that is missing its type or text', () => {
    expect(() => parseNote('Just text', 'changes/a.md')).toThrow(/changes\/a.md: start with a --- block/);
    expect(() => parseNote(note('feature', 'x'), 'b.md')).toThrow(/type must be one of new, improved, fixed/);
    expect(() => parseNote(note('new', ''), 'c.md')).toThrow(/add a line/);
  });
});

describe('versions', () => {
  it('bumps patch, minor and major', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(nextVersion('0.1.3', 'minor')).toBe('0.2.0');
    expect(nextVersion('0.9.3', 'major')).toBe('1.0.0');
    expect(() => nextVersion('0.1.0', 'huge')).toThrow();
    expect(() => nextVersion('v1', 'patch')).toThrow(/Not a version/);
  });

  it('compares versions number by number', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0);
  });

  it('suggests minor when anything is new, otherwise patch, never major', () => {
    expect(suggestBump([{ type: 'fixed' }, { type: 'new' }])).toBe('minor');
    expect(suggestBump([{ type: 'fixed' }, { type: 'improved' }])).toBe('patch');
  });
});

describe('CHANGELOG.md and the app entry', () => {
  const notes = [
    { type: 'fixed', text: 'A fix.' },
    { type: 'new', text: 'A feature.' },
    { type: 'new', text: 'Another.' },
  ];
  const intro = '# Changelog\n\nWhat changed.\n\n';
  const old = '## 0.1.0 (2026-11-01)\n\n### New\n\n- First version.\n';

  it('writes a section grouped New, Improved, Fixed, and puts it first', () => {
    const section = renderSection('0.2.0', '2026-11-05', notes);
    expect(section).toBe('## 0.2.0 (2026-11-05)\n\n### New\n\n- A feature.\n- Another.\n\n### Fixed\n\n- A fix.\n');
    const changelog = addToChangelog(intro + old, section);
    expect(changelog.indexOf('## 0.2.0')).toBeLessThan(changelog.indexOf('## 0.1.0'));
    expect(changelog.startsWith(intro)).toBe(true);
    expect(addToChangelog('# Changelog\n', section)).toBe(`# Changelog\n\n${section}`);
  });

  it('finds one release’s section for the GitHub release notes', () => {
    const changelog = addToChangelog(intro + old, renderSection('0.2.0', '2026-11-05', notes));
    expect(sectionFor(changelog, '0.2.0')).toMatch(/^## 0\.2\.0[\s\S]*- A fix\.$/);
    expect(sectionFor(changelog, '0.1.0')).toBe(old.trim());
    expect(sectionFor(changelog, '0.3.0')).toBeNull();
  });

  it('makes the entry the app shows under What’s new', () => {
    expect(releaseEntry('0.2.0', '2026-11-05', notes)).toEqual({
      version: '0.2.0',
      date: '2026-11-05',
      new: ['A feature.', 'Another.'],
      fixed: ['A fix.'],
    });
  });
});

describe('pull request check (CI)', () => {
  const base = {
    baseVersion: '0.1.0',
    version: '0.1.0',
    changed: [],
    changelog: '# Changelog\n\n## 0.1.0 (2026-11-01)\n',
    entries: [{ version: '0.1.0' }],
    notesLeft: 0,
    skip: false,
  };

  it('asks for a note when the app changes', () => {
    expect(checkPullRequest({ ...base, changed: ['src/screens/PlanScreen.tsx'] })).toEqual([
      expect.stringMatching(/adds no changelog note/),
    ]);
    expect(checkPullRequest({ ...base, changed: ['src/screens/PlanScreen.tsx', 'changes/plan-text.md'] })).toEqual([]);
    expect(checkPullRequest({ ...base, changed: ['src/screens/PlanScreen.tsx'], skip: true })).toEqual([]);
  });

  it('doesn’t ask for a note for tests, docs or tooling only', () => {
    expect(checkPullRequest({ ...base, changed: ['src/screens/PlanScreen.test.tsx', 'README.md', 'scripts/check.mjs'] })).toEqual([]);
  });

  it('checks a release is complete', () => {
    const release = {
      ...base,
      version: '0.2.0',
      changed: ['package.json', 'CHANGELOG.md', 'src/changelog.json'],
      changelog: '# Changelog\n\n## 0.2.0 (2026-11-05)\n\n## 0.1.0 (2026-11-01)\n',
      entries: [{ version: '0.2.0' }, { version: '0.1.0' }],
    };
    expect(checkPullRequest(release)).toEqual([]);
    expect(checkPullRequest({ ...release, changelog: base.changelog, entries: base.entries, notesLeft: 2 })).toEqual([
      'CHANGELOG.md has no "## 0.2.0" section.',
      'src/changelog.json doesn\'t start with 0.2.0.',
      '2 changelog note(s) in changes/ weren\'t included in the release.',
    ]);
    expect(checkPullRequest({ ...base, version: '0.0.9' })).toEqual(['The version went down, from 0.1.0 to 0.0.9.']);
  });
});
