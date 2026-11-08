import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { betaInfo, isBetaBuild, readPendingNotes } from './beta-lib.mjs';

describe('beta builds', () => {
  it('are made only on Cloudflare Pages or with BETA=1', () => {
    expect(isBetaBuild({ CF_PAGES: '1' })).toBe(true);
    expect(isBetaBuild({ BETA: '1' })).toBe(true);
    expect(isBetaBuild({})).toBe(false);
    expect(isBetaBuild({ GITHUB_ACTIONS: 'true' })).toBe(false);
  });

  it('describe their branch and the waiting notes, grouped', () => {
    const notes = [
      { type: 'fixed', text: 'A fix.' },
      { type: 'new', text: 'Practices.' },
    ];
    expect(betaInfo({ CF_PAGES: '1', CF_PAGES_BRANCH: 'claude/practice' }, notes)).toEqual({
      branch: 'claude/practice',
      next: { new: ['Practices.'], fixed: ['A fix.'] },
    });
    expect(betaInfo({ BETA: '1' })).toEqual({ branch: 'local', next: {} });
    expect(betaInfo({}, notes)).toBeNull();
  });

  it('read the notes in changes/, skipping the README', () => {
    const dir = mkdtempSync(join(tmpdir(), 'next5-notes-'));
    try {
      writeFileSync(join(dir, 'README.md'), '# Changelog notes\n');
      writeFileSync(join(dir, 'b.md'), '---\ntype: fixed\n---\nSecond.\n');
      writeFileSync(join(dir, 'a.md'), '---\ntype: new\n---\nFirst.\n');
      expect(readPendingNotes(dir)).toEqual([
        { type: 'new', text: 'First.' },
        { type: 'fixed', text: 'Second.' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
