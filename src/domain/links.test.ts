import { describe, expect, it } from 'vitest';
import { splitLinks } from './links';

describe('splitLinks', () => {
  it('returns plain text as one segment, and nothing for nothing', () => {
    expect(splitLinks('Elbow in.')).toEqual([{ text: 'Elbow in.' }]);
    expect(splitLinks('')).toEqual([]);
  });

  it('finds a link in the middle of text', () => {
    expect(splitLinks('Watch https://example.com/drill now')).toEqual([
      { text: 'Watch ' },
      { text: 'https://example.com/drill', href: 'https://example.com/drill' },
      { text: ' now' },
    ]);
  });

  it('leaves trailing punctuation out of the link', () => {
    expect(splitLinks('See https://example.com/a.')).toEqual([
      { text: 'See ' },
      { text: 'https://example.com/a', href: 'https://example.com/a' },
      { text: '.' },
    ]);
    expect(splitLinks('(see https://example.com/a)')).toEqual([
      { text: '(see ' },
      { text: 'https://example.com/a', href: 'https://example.com/a' },
      { text: ')' },
    ]);
    expect(splitLinks('https://example.com/a?x=1, then')[0]).toEqual({
      text: 'https://example.com/a?x=1',
      href: 'https://example.com/a?x=1',
    });
  });

  it('keeps a closing bracket that belongs to the link', () => {
    expect(splitLinks('https://example.com/Drill_(zone)')).toEqual([
      {
        text: 'https://example.com/Drill_(zone)',
        href: 'https://example.com/Drill_(zone)',
      },
    ]);
  });

  it('finds several links, http and https, across lines', () => {
    const segments = splitLinks('One http://a.example/x\nTwo HTTPS://b.example/y!');
    expect(segments.filter((s) => s.href).map((s) => s.href)).toEqual(['http://a.example/x', 'HTTPS://b.example/y']);
    expect(segments.map((s) => s.text).join('')).toBe('One http://a.example/x\nTwo HTTPS://b.example/y!');
  });

  it('ignores other schemes and a bare scheme', () => {
    expect(splitLinks('javascript:alert(1) and ftp://x.example and https://')).toEqual([{ text: 'javascript:alert(1) and ftp://x.example and https://' }]);
  });
});
