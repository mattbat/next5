import type { PlanItem } from '../domain/practicePlan';
import { splitLinks } from '../domain/links';

/**
 * The coaches' plan as a PDF (PR10), laid out for a phone: narrow pages, big
 * text, a rule above each block, tappable web links. jsPDF is loaded only
 * when this runs, so it stays out of the main bundle.
 */

/** Page size in points: 4 × 7.5 inches, about a phone screen. */
export const PAGE = { width: 288, height: 540 } as const;
const MARGIN = { x: 26, top: 30, bottom: 38 };
const BODY = 11.5;
const LINK_COLOR: [number, number, number] = [0, 70, 200];

/** A string of the given code points, for pattern classes. */
const chars = (...codes: number[]) => String.fromCodePoint(...codes);
const HYPHENS = new RegExp(`[${chars(0x2010, 0x2011, 0x2012, 0x2212)}]`, 'g');
const WIDE_SPACES = new RegExp(`[${chars(0x2002, 0x2003, 0x2009, 0x202f)}]`, 'g');
/** Anything but ASCII, Latin-1 and the Windows punctuation Helvetica has: – — ‘ ’ “ ” • … */
const UNDRAWABLE = new RegExp(
  `[^${chars(10)}${chars(0x20)}-${chars(0x7e)}${chars(0xa0)}-${chars(0xff, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026)}]`,
  'gu',
);

/**
 * jsPDF's built-in Helvetica draws Latin-1 and a few Windows punctuation
 * marks, nothing else. Swap or drop what it can't draw.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(HYPHENS, '-')
    .replace(WIDE_SPACES, ' ')
    .replaceAll(chars(0x21b6), '')
    .replaceAll(chars(0x2192), '->')
    .replace(UNDRAWABLE, '')
    .replace(/ {2,}/g, ' ');
}

export const practicePdfName = (date: string): string => `Practice plan ${date}.pdf`;

type Word = { text: string; href?: string };

/** Turns a line into words, each knowing the link it belongs to. */
function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const segment of splitLinks(pdfSafe(text))) {
    for (const part of segment.text.split(/\s+/)) if (part) words.push({ text: part, href: segment.href });
  }
  return words;
}

type Pdf = import('jspdf').jsPDF;

/** Draws a plan and returns the PDF file. */
export async function buildPlanPdf(items: PlanItem[], title: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc: Pdf = new jsPDF({
    unit: 'pt',
    format: [PAGE.width, PAGE.height],
    orientation: 'portrait',
    compress: true,
  });
  doc.setProperties({ title: pdfSafe(title) });
  const bottom = PAGE.height - MARGIN.bottom;
  let y = MARGIN.top;

  const font = (bold: boolean, size: number) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const newPage = () => {
    doc.addPage([PAGE.width, PAGE.height], 'portrait');
    y = MARGIN.top;
  };
  /** Starts a new page unless `height` more points fit. */
  const need = (height: number) => {
    if (y + height > bottom && y > MARGIN.top) newPage();
  };

  /** Wraps and draws one paragraph; links are drawn blue with a real link on them. */
  const paragraph = (
    text: string,
    opts: {
      size: number;
      bold?: boolean;
      indent?: number;
      lead?: number;
      keepWith?: number;
    },
  ) => {
    font(!!opts.bold, opts.size);
    const left = MARGIN.x + (opts.indent ?? 0);
    const width = PAGE.width - MARGIN.x - left;
    const lead = opts.lead ?? opts.size * 1.35;
    const space = doc.getTextWidth(' ');
    // Break words wider than the page, e.g. long links, into pieces.
    const pieces: Word[] = [];
    for (const word of wordsOf(text)) {
      let rest = word.text;
      while (doc.getTextWidth(rest) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && doc.getTextWidth(rest.slice(0, n)) > width) n--;
        pieces.push({ text: rest.slice(0, n), href: word.href });
        rest = rest.slice(n);
      }
      pieces.push({ text: rest, href: word.href });
    }
    const lines: Word[][] = [];
    let current: Word[] = [];
    let used = 0;
    for (const piece of pieces) {
      const w = doc.getTextWidth(piece.text);
      if (current.length > 0 && used + space + w > width) {
        lines.push(current);
        current = [];
        used = 0;
      }
      used += (current.length > 0 ? space : 0) + w;
      current.push(piece);
    }
    if (current.length > 0) lines.push(current);
    // A heading must land on a page with at least the start of what follows it.
    need(lead * Math.min(lines.length, 2) + (opts.keepWith ?? 0));
    for (const line of lines) {
      need(lead);
      let x = left;
      for (const piece of line) {
        font(!!opts.bold, opts.size);
        const w = doc.getTextWidth(piece.text);
        if (piece.href) {
          doc.setTextColor(...LINK_COLOR);
          doc.text(piece.text, x, y + opts.size);
          doc.link(x, y, w, lead, { url: piece.href });
          doc.setDrawColor(...LINK_COLOR);
          doc.setLineWidth(0.5);
          doc.line(x, y + opts.size + 1.5, x + w, y + opts.size + 1.5);
          doc.setTextColor(0, 0, 0);
        } else {
          doc.text(piece.text, x, y + opts.size);
        }
        x += w + space;
      }
      y += lead;
    }
  };

  doc.setTextColor(0, 0, 0);
  for (const item of items) {
    switch (item.kind) {
      case 'title':
        paragraph(item.text, { size: 18, bold: true, lead: 23, keepWith: 14 });
        y += 3;
        break;
      case 'gap':
        y += 8;
        break;
      case 'time': {
        // A rule and some air above each block, then the time in bold.
        need(14 + 1 + 20 + 2 * BODY * 1.35);
        if (y > MARGIN.top + 30) {
          y += 4;
          doc.setDrawColor(170, 170, 170);
          doc.setLineWidth(0.75);
          doc.line(MARGIN.x, y, PAGE.width - MARGIN.x, y);
          y += 10;
        }
        paragraph(item.text, {
          size: 15,
          bold: true,
          lead: 20,
          keepWith: BODY * 1.35,
        });
        y += 2;
        break;
      }
      case 'heading':
        y += 3;
        paragraph(item.text, {
          size: 12.5,
          bold: true,
          lead: 17,
          keepWith: BODY * 1.35,
        });
        break;
      case 'line':
        paragraph(item.text, {
          size: BODY,
          bold: item.bold,
          indent: item.indent * 12,
        });
        break;
    }
  }

  // Page numbers.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(false, 8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`${p} of ${pages}`, PAGE.width / 2, PAGE.height - 18, {
      align: 'center',
    });
  }
  return doc.output('blob');
}
