// EXP-20: Medikamenten-Block in CSV (eine Zelle), JSON v1 (Roundtrip, Schema), PDF (Tabelle/Karten) und „Als Kopie".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { createIdGenerator, instantiateCatalogTemplate, keyBetween, type Entry } from '@stb/core';
import { exportCsvLong, exportCsvWide } from './csv.js';
import { copyWithNewIds } from './copy.js';
import { FIXTURE_EXPORT_NOW, exportFixture } from './fixture.js';
import { buildExport, parseExport, type ExportSource } from './json-v1.js';
import { buildReport } from './pdf-model.js';
import { renderReportPdf } from './pdf.js';

function withMedication(): { src: ExportSource; entry: Entry; presetIds: string[] } {
  const s = exportFixture();
  const { newId } = createIdGenerator({ now: () => Date.parse('2026-02-20T08:00:00.000Z') });
  const tpl = instantiateCatalogTemplate('pain-medication', { id: newId(), diaryId: s.diaries[0]!.id, order: keyBetween(s.templates[1]!.order, null), newId }, { now: () => Date.parse('2026-02-20T08:00:00.000Z') });
  const [pain, med] = tpl.version.blocks;
  if (med?.type !== 'medication') throw new Error('Medikamenten-Block erwartet');
  const [ibu, para] = med.config.presets;
  const entry: Entry = {
    id: newId(), diaryId: s.diaries[0]!.id, templateId: tpl.template.id, templateVersion: 1, occurredAt: '2026-02-20T08:00:00.000Z',
    recordedAt: '2026-02-20T08:05:00.000Z', updatedAt: '2026-02-20T08:05:00.000Z', authorId: 'local-user', tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' },
    hlc: '1771574700000:0000:fixture',
    values: {
      [pain!.id]: 6,
      // 07:00 UTC = 08:00 in Europe/Berlin (Winter)
      [med.id]: { items: [
        { id: newId(), presetId: ibu!.id, name: 'Ibuprofen', dose: 400, unit: 'mg', at: '2026-02-20T07:00:00.000Z', effect: 5 },
        { id: newId(), name: 'Arnika', dose: 5, unit: 'Tropfen' },
      ] },
    },
  };
  return { src: { ...s, templates: [...s.templates, tpl.template], versions: [...s.versions, tpl.version], entries: [...s.entries, entry] }, entry, presetIds: [ibu!.id, para!.id] };
}

describe('EXP-20: Medikamenten-Block im Export', () => {
  const { src, entry, presetIds } = withMedication();
  const cell = 'Ibuprofen 400 mg 08:00; Arnika 5 Tropfen';

  it('EXP-20: CSV enthält eine Zelle je Eintrag (Uhrzeit in der Tagebuch-Zeitzone), long und wide', () => {
    const long = exportCsvLong(src, { profile: 'standard', now: FIXTURE_EXPORT_NOW });
    const row = long.split('\r\n').filter((l) => l.includes(entry.id) && l.includes(',medication,'));
    expect(row).toHaveLength(1);
    expect(row[0]).toContain(cell);
    const wide = exportCsvWide(src, { profile: 'excel-de', now: FIXTURE_EXPORT_NOW });
    expect(wide).toContain(cell);
  });

  it('EXP-20: JSON v1 validiert gegen das Schema und der Import-Roundtrip ist verlustfrei', () => {
    const doc = buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    const schema = JSON.parse(readFileSync(new URL('../schema/stb-export-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
    const validate = ajv.compile(schema);
    expect(validate(JSON.parse(JSON.stringify(doc)))).toBe(true);
    const back = parseExport(JSON.stringify(doc));
    expect(back.diaries[0]!.entries.find((e) => e.id === entry.id)!.values).toEqual(entry.values);
    expect(back).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it('EXP-20: PDF-Bericht zeigt die Positionen in Tabelle und Karten und rendert in allen Layouts', async () => {
    const r = buildReport(src, { now: FIXTURE_EXPORT_NOW });
    const table = r.tables.find((t) => t.columns.some((c) => c.label === 'Medikamente'))!;
    const idx = table.columns.findIndex((c) => c.label === 'Medikamente');
    expect(table.rows[0]!.cells[idx]).toBe(cell);
    expect(r.cards.flatMap((c) => c.fields).find((f) => f.label === 'Medikamente')!.text).toBe(cell);
    for (const layout of ['table', 'cards', 'dashboard'] as const) {
      const bytes = await renderReportPdf(r, { layout, imageSize: 'a5', multiselectBlockIds: [], renderBodymap: async () => null });
      expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    }
  });

  it('EXP-20: „Als Kopie importieren“ schreibt Vorgaben- und Positions-IDs konsistent um', () => {
    let n = 0;
    const doc = buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    const copy = copyWithNewIds(doc, () => `01960000-0000-7000-8000-${String(++n).padStart(12, '0')}`);
    const d = copy.diaries[0]!;
    const tpl = d.templates.find((t) => t.versions[0]!.blocks.some((b) => b.type === 'medication'))!;
    const e = d.entries.find((x) => x.templateId === tpl.id)!;
    const med = tpl.versions[0]!.blocks.find((b) => b.type === 'medication')!;
    if (med.type !== 'medication') throw new Error('Medikamenten-Block erwartet');
    const items = (e.values[med.id] as { items: { id: string; presetId?: string; name: string }[] }).items;
    expect(items.map((i) => i.name)).toEqual(['Ibuprofen', 'Arnika']);
    expect(items[0]!.presetId).toBe(med.config.presets[0]!.id);
    expect(items[0]!.presetId).not.toBe(presetIds[0]);
    expect(items[1]!.presetId).toBeUndefined();
    expect(parseExport(JSON.stringify(copy))).toBeTruthy();
  });
});
