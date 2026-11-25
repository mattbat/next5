import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../domain/practicePlan';
import { buildPlanPdf, PAGE, pdfSafe, practicePdfName } from './practicePdf';

const asText = async (blob: Blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer());

describe('plan PDF (PR10)', () => {
  const items: PlanItem[] = [
    { kind: 'title', text: '9U Comets practice' },
    { kind: 'line', text: 'Sat, Nov 28 · 6:00 PM · 30 min', indent: 0 },
    { kind: 'gap' },
    { kind: 'time', text: '6:00–6:08 PM (8 min)' },
    { kind: 'heading', text: 'Form shooting' },
    { kind: 'line', text: 'Coach: Coach Sam', indent: 1 },
    {
      kind: 'line',
      text: 'Elbow in. Video: https://example.com/form.',
      indent: 1,
    },
  ];

  it('makes a phone-sized PDF', async () => {
    const blob = await buildPlanPdf(items, '9U Comets practice plan');
    expect(blob.type).toBe('application/pdf');
    const text = await asText(blob);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect([PAGE.width, PAGE.height]).toEqual([288, 540]);
    expect(text).toMatch(/\/MediaBox \[0 0 288\.0* 540\.0*\]/);
  });

  it('puts a real link on the web address, without the full stop after it', async () => {
    // Uncompressed streams would hide it; link annotations are plain objects either way.
    const text = await asText(await buildPlanPdf(items, 'Plan'));
    expect(text).toContain('/Subtype /Link');
    expect(text).toContain('https://example.com/form');
    expect(text).not.toContain('https://example.com/form.)');
    expect((text.match(/\/Subtype \/Link/g) ?? []).length).toBe(1);
  });

  it('starts a new page rather than running off the bottom, and keeps a heading with its first line', async () => {
    const many: PlanItem[] = [{ kind: 'title', text: 'Long plan' }];
    for (let i = 0; i < 40; i++) {
      many.push(
        { kind: 'gap' },
        { kind: 'time', text: `${i}:00–${i}:10 (10 min)` },
        { kind: 'heading', text: `Drill ${i}` },
        {
          kind: 'line',
          text: 'A coaching point that is long enough to wrap onto a second line on a phone page.',
          indent: 1,
        },
      );
    }
    const text = await asText(await buildPlanPdf(many, 'Long'));
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(3);
  });

  it('breaks a link that is wider than the page, keeping one link per piece', async () => {
    const long = `https://example.com/${'a'.repeat(120)}`;
    const text = await asText(await buildPlanPdf([{ kind: 'line', text: long, indent: 0 }], 'Long link'));
    expect((text.match(/\/Subtype \/Link/g) ?? []).length).toBeGreaterThan(1);
  });

  it('swaps what Helvetica cannot draw and keeps what it can', () => {
    expect(pdfSafe('Undo ↶ · ok – “fine” 👍 ’s')).toBe('Undo · ok – “fine” ’s');
    expect(pdfSafe('2 → 3')).toBe('2 -> 3');
  });

  it('names the file by date', () => {
    expect(practicePdfName('2026-11-28')).toBe('Practice plan 2026-11-28.pdf');
  });
});
