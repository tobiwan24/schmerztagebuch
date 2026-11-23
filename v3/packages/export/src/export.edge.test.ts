// Randfälle des Exports (Spec 07): leere Quellen, Zeiträume mit Uhrzeit, archivierte Spalten, viele Zeilen/Spalten im PDF,
// inkonsistente Importdateien, „Als Kopie" mit Filter und Schnelleintrag-Einstellungen.
import { describe, expect, it } from 'vitest';
import type { Entry, TemplateVersion } from '@stb/core';
import { exportFixture, FIXTURE_EXPORT_NOW } from './fixture.js';
import { buildReport } from './pdf-model.js';
import { pdfText, renderReportPdf } from './pdf.js';
import { exportCsvLong, exportCsvWide } from './csv.js';
import { buildExport, ImportError, parseExport } from './json-v1.js';
import { copyWithNewIds } from './copy.js';

const src = exportFixture();
const empty = { ...src, entries: [], savedFilters: [], bodymapImages: [] };
let seq = 0;
const newId = () => `01960000-0000-7000-8000-${String(++seq).padStart(12, '0')}`;

/** Eintrag mit Zeitraum (Uhrzeiten) und einer zusätzlichen Version, in der ein Feld noch existierte (→ archiviert). */
function withArchivedAndTimedPeriod() {
  const s = exportFixture();
  const t = s.templates[1]!; // general-pain, Version 1
  const cur = s.versions.find((v) => v.templateId === t.id && v.version === t.currentVersion)!;
  const extra = { ...cur.blocks.find((b) => b.type === 'text' || b.type === 'textarea')!, id: '01960000-0000-7000-9000-000000000001', label: 'Altes Feld', type: 'text' as const, config: {}, order: 'zz' };
  const v0: TemplateVersion = { ...cur, version: cur.version + 1, blocks: [...cur.blocks, extra] };
  const t2 = { ...t, currentVersion: cur.version + 2 };
  const v2: TemplateVersion = { ...cur, version: cur.version + 2 };
  const e: Entry = {
    ...s.entries[3]!, id: '01960000-0000-7000-9000-000000000002', templateVersion: v0.version, occurredAt: '2026-02-20T08:00:00.000Z',
    period: { start: '2026-02-20T08:00:00.000Z', end: '2026-02-20T10:30:00.000Z' }, values: { [extra.id]: 'nur in alter Version' },
  };
  return { ...s, templates: [s.templates[0]!, t2], versions: [...s.versions, v0, v2], entries: [...s.entries, e] };
}

describe('Export: Randfälle', () => {
  it('Bericht ohne Einträge: Zeitraum = heute, keine Tabellen; eigener Titel', () => {
    const r = buildReport(empty, { now: FIXTURE_EXPORT_NOW, title: 'Für Dr. X' });
    expect(r).toMatchObject({ title: 'Für Dr. X', from: '2026-03-01', to: '2026-03-01', daysWithEntry: 0, entryCount: 0, tables: [], bodymaps: [], diaryNames: [] });
  });

  it('Bericht: Zeitraum aus dem Filter, archivierte Spalte gekennzeichnet, Zeitraum mit Uhrzeiten', () => {
    const s = withArchivedAndTimedPeriod();
    const r = buildReport(s, { now: FIXTURE_EXPORT_NOW, filter: { diaryIds: [s.diaries[0]!.id], range: { from: '2026-02-01', to: '2026-02-28' } } });
    expect(r.from).toBe('2026-02-01');
    expect(r.daysInRange).toBe(28);
    const table = r.tables.find((t) => t.columns.some((c) => c.archived))!;
    expect(table.columns.at(-1)).toEqual({ label: 'Altes Feld', archived: true });
    expect(table.rows.some((row) => row.when.includes('–') && row.cells.includes('nur in alter Version'))).toBe(true);
  });

  it('PDF: viele Zeilen und Spalten (Seitenumbrüche, kleine Schrift), Körperkarten ohne Bild übersprungen, Zeichen auf WinAnsi', async () => {
    const s = withArchivedAndTimedPeriod();
    const many = Array.from({ length: 90 }, (_, i) => ({ ...s.entries[0]!, id: `01960000-0000-7000-a000-${String(i).padStart(12, '0')}`, occurredAt: new Date(Date.parse('2026-01-01T08:00:00Z') + i * 3_600_000).toISOString() }));
    const r = buildReport({ ...s, entries: [...s.entries, ...many] }, { now: FIXTURE_EXPORT_NOW });
    r.tables[0]!.columns.push(...Array.from({ length: 8 }, (_, i) => ({ label: `Zusatz ${i}`, archived: false })));
    for (const row of r.tables[0]!.rows) row.cells.push(...Array.from({ length: 8 }, () => 'x'));
    let calls = 0;
    const bytes = await renderReportPdf(r, { imageSize: 'a4', renderBodymap: async () => (calls++, null) });
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect(calls).toBeGreaterThan(0);
    const none = await renderReportPdf(r, { imageSize: 'none', renderBodymap: async () => { throw new Error('darf nicht aufgerufen werden'); } });
    expect(none.length).toBeGreaterThan(1000);
    expect(pdfText('a – b ≥ 3 … „x“ 😀 →')).toBe('a - b >= 3 ... "x" ? ->');
  });

  it('CSV: Filter, Zeitraum mit Uhrzeiten (period_end), archiviertes Feld, beide Profile', () => {
    const s = withArchivedAndTimedPeriod();
    const filter = { diaryIds: [s.diaries[0]!.id], range: { from: '2026-02-20', to: '2026-02-20' } };
    const long = exportCsvLong(s, { profile: 'excel-de', filter, now: FIXTURE_EXPORT_NOW });
    expect(long).toContain('nur in alter Version');
    expect(long).toContain('20.02.2026 11:30'); // Ende in Europe/Berlin, Excel-Format
    const wide = exportCsvWide(s, { profile: 'standard', filter, now: FIXTURE_EXPORT_NOW });
    expect(wide.split('\r\n')).toHaveLength(3); // BOM+Kopf, eine Zeile, abschließender Umbruch
    expect(wide).toContain('2026-02-20T10:30:00.000Z'); // Standard: ISO unverändert
  });

  it('Import: inkonsistente Dateien werden mit Grund abgelehnt', () => {
    const doc = buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    const d = doc.diaries[0]!;
    const variants = [
      { ...doc, diaries: [{ ...d, templates: [{ ...d.templates[0]!, diaryId: newId() }, ...d.templates.slice(1)] }] },
      { ...doc, diaries: [{ ...d, templates: [{ ...d.templates[0]!, currentVersion: 99 }, ...d.templates.slice(1)] }] },
      { ...doc, diaries: [{ ...d, entries: [{ ...d.entries[0]!, diaryId: newId() }] }] },
      { ...doc, diaries: [{ ...d, entries: [{ ...d.entries[0]!, templateVersion: 42 }] }] },
      { ...doc, diaries: [{ ...d, attachments: [{ id: newId(), diaryId: d.diary.id, entryId: newId(), kind: 'pdf', mime: 'application/pdf', name: 'x.pdf', sizeBytes: 1, createdAt: '2026-01-01T00:00:00.000Z', dataUrl: 'data:application/pdf;base64,AA==' }] }] },
    ];
    for (const v of variants) {
      const e = (() => {
        try {
          parseExport(JSON.stringify(v));
          return null;
        } catch (err) {
          return err as ImportError;
        }
      })();
      expect(e?.code).toBe('inconsistent');
      expect(e!.details.length).toBeGreaterThan(0);
    }
  });

  it('RDM-028 P2: Als Kopie schreibt quickTemplateIds um und entfernt unbekannte', () => {
    const tid = src.templates[0]!.id;
    const withIds = { ...src, diaries: [{ ...src.diaries[0]!, settings: { ...src.diaries[0]!.settings, quickTemplateIds: [tid, '01900000-0000-7000-8000-000000000000'] } }] };
    const copy = copyWithNewIds(buildExport(withIds, { appVersion: 't', now: FIXTURE_EXPORT_NOW }), newId);
    const d = copy.diaries[0]!;
    expect(d.diary.settings.quickTemplateIds).toEqual([d.templates.find((t) => t.name === src.templates[0]!.name)!.id]);
  });

  it('Als Kopie: Filter (Vorlagen, Bedingungen, oder-Gruppen) und Schnelleintrag-Einstellungen werden umgeschrieben', () => {
    const filter = { diaryIds: [src.diaries[0]!.id], templateIds: [src.templates[0]!.id], range: { preset: 'all' as const }, conditions: src.savedFilters[0]!.filter.conditions!, anyOf: [src.savedFilters[0]!.filter.conditions!] };
    const doc = buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW, filter });
    const copy = copyWithNewIds(doc, newId);
    const d = copy.diaries[0]!;
    expect(copy.filter!.diaryIds).toEqual([d.diary.id]);
    expect(copy.filter!.templateIds).toEqual([d.templates.find((t) => t.name === src.templates[0]!.name)!.id]);
    const cond = copy.filter!.anyOf![0]![0] as { blockId: string; optionIds: string[] };
    expect(cond.blockId).not.toBe((src.savedFilters[0]!.filter.conditions![0] as { blockId: string }).blockId);
    expect(d.diary.settings.quickEntryTemplateId).toBe(copy.filter!.templateIds![0]);
    expect(d.diary.settings.quickEntryBlockIds).toHaveLength(1);
    expect(d.diary.settings.quickEntryBlockIds![0]).not.toBe(src.diaries[0]!.settings.quickEntryBlockIds![0]);
  });
});

describe('PDF: Bild nicht ladbar', () => {
  it('EXP-19: ein nicht ladbares Körperkarten- oder Diagrammbild bricht den Export nicht ab — alle Layouts liefern ein gültiges PDF, das Bild entfällt', async () => {
    const r = buildReport(exportFixture(), { now: FIXTURE_EXPORT_NOW });
    expect(r.bodymaps.length).toBeGreaterThan(0);
    for (const layout of ['table', 'cards', 'dashboard'] as const) {
      const bytes = await renderReportPdf(r, {
        layout, imageSize: 'a5', multiselectBlockIds: [],
        renderBodymap: async () => { throw new Error('Body-Map-Bild konnte nicht geladen werden'); },
        renderChart: async () => { throw new Error('Diagramm nicht renderbar'); },
      });
      expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
      expect(new TextDecoder().decode(bytes.subarray(-8))).toContain('%%EOF');
    }
  });
});
