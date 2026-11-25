/**
 * Finding web links in free text (coaching points, PR2/PR10): pure, so the
 * app, the shared text and the PDF all agree on what a link is.
 */
export interface TextSegment {
  text: string;
  /** Set when the segment is a web link; same as `text`. */
  href?: string;
}

const URL_AT = /https?:\/\/[^\s<>]+/gi;
/** Characters that end a sentence or close a quote; never part of a link when trailing. */
const TRAILING = /[.,;:!?'"’”»…]$/;
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Drops what a person would read as punctuation after the link, keeping a ")" that closes one inside it. */
function trimUrl(url: string): string {
  let end = url;
  for (;;) {
    if (TRAILING.test(end)) {
      end = end.slice(0, -1);
      continue;
    }
    const last = end.charAt(end.length - 1);
    const opener = CLOSERS[last];
    if (opener) {
      const opens = end.split(opener).length - 1;
      const closes = end.split(last).length - 1;
      if (closes > opens) {
        end = end.slice(0, -1);
        continue;
      }
    }
    return end;
  }
}

/** Splits text into plain and link segments, in order; joining their text gives the original. */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let at = 0;
  for (const match of text.matchAll(URL_AT)) {
    const url = trimUrl(match[0]);
    // "http://" with nothing after it isn't a link.
    if (!/^https?:\/\/.+/i.test(url)) continue;
    if (match.index > at) segments.push({ text: text.slice(at, match.index) });
    segments.push({ text: url, href: url });
    at = match.index + url.length;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}
