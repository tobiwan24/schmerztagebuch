// Zusammenfassung für den Arzt (Eingabe und PDF-Abschnitt): Teil von VOI-15, die ID steht im E2E-Test.
import { describe, expect, it } from 'vitest';
import { exportFixture, FIXTURE_EXPORT_NOW } from './fixture.js';
import { buildSummaryInput, summaryPreview } from './summary.js';
import { buildReport } from './pdf-model.js';
import { renderReportPdf } from './pdf.js';

const src = exportFixture();

describe('Zusammenfassung für den Arzt', () => {
  it('Standard: nur Kennzahlen, keine Notizen und keine Freitexte (Arzttermine nur als Anzahl)', () => {
    const input = buildSummaryInput(src, { now: FIXTURE_EXPORT_NOW });
    expect(input.notes).toBeUndefined();
    expect(input.period).toMatch(/^\d{2}\.\d{2}\.\d{4} bis \d{2}\.\d{2}\.\d{4}$/);
    expect(input.facts.find((f) => f.label === 'Einträge')?.value).toBe('4');
    expect(input.facts.some((f) => f.label.startsWith('Schmerzstärke') && /Mittelwert 5/.test(f.value))).toBe(true);
    expect(input.facts.find((f) => f.label === 'Arzttermine im Zeitraum')?.value).toBe('1');
    const text = summaryPreview(input);
    expect(text).not.toContain('Neurologie');
    expect(text).not.toContain('Übelkeit, "laut"');
    expect(text).not.toContain('Notiz');
    expect(input.facts.length).toBeLessThanOrEqual(60);
  });

  it('Notizen kommen nur mit Häkchen, neueste zuerst mit Datum, und stehen in der Vorschau', () => {
    const input = buildSummaryInput(src, { now: FIXTURE_EXPORT_NOW, includeNotes: true });
    expect(input.notes?.[0]).toBe('11.02.2026: +49 Notiz');
    expect(input.notes?.some((n) => n.includes('Übelkeit, "laut"'))).toBe(true);
    expect(summaryPreview(input)).toContain('Notizen:');
  });

  it('PDF: der bearbeitete Text erscheint als eigener Abschnitt mit Hinweis, ohne Text entfällt er', async () => {
    const report = buildReport(src, { now: FIXTURE_EXPORT_NOW });
    const base = { imageSize: 'none' as const, renderBodymap: async () => null };
    const without = await renderReportPdf(report, base);
    const withText = await renderReportPdf(report, { ...base, summary: 'Die Schmerzstärke lag im Mittel bei 5.' });
    const blank = await renderReportPdf(report, { ...base, summary: '   ' });
    expect(withText.length).toBeGreaterThan(without.length);
    expect(blank.length).toBe(without.length);
  });
});
