// Import in die Web-Datenschicht (Spec 07): Rundweg, Idempotenz, „Als Kopie", Ablehnung ohne DB-Änderung.
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { createIdGenerator } from '@stb/core';
import { FIXTURE_EXPORT_NOW, buildExport, exportFixture, parseExport, ImportError } from '@stb/export';
import { StbDb } from '../../apps/web/src/data/db.js';
import { plainCodec } from '../../apps/web/src/data/codec/plain.js';
import { createCodecRegistry } from '../../apps/web/src/data/codec/registry.js';
import { createRecordRepository } from '../../apps/web/src/data/repositories/records.js';
import { createDiaryRepository } from '../../apps/web/src/data/repositories/diary.js';
import { applyImport, collectExportSource, planImport } from '../../apps/web/src/data/import-export.js';

let n = 0;
const dbs: StbDb[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
});

async function device() {
  const db = new StbDb(`stb-v3-import-${++n}`);
  await db.open();
  dbs.push(db);
  let t = 1_900_000_000_000;
  const clock = { now: () => (t += 1000) };
  const records = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false });
  return { db, records, diary: createDiaryRepository(records), newId: createIdGenerator(clock).newId };
}

const src = exportFixture();
const file = JSON.stringify(buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW }));
const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));
const sortVersions = <T extends { templateId: string; version: number }>(xs: T[]) =>
  [...xs].sort((a, b) => `${a.templateId}#${a.version}`.localeCompare(`${b.templateId}#${b.version}`));
/** Records der Fixture: 1 Tagebuch, 2 Vorlagen, 3 Versionen, 4 Einträge, 1 Filter, 1 Bild. */
const RECORDS = 12;

describe('Import', () => {
  it('EXP-02: Roundtrip: Export → Import in leere DB ergibt identische Tagebücher, Vorlagen(-versionen), Einträge', async () => {
    const d = await device();
    const plan = await planImport(d.records, parseExport(file), { newId: d.newId });
    expect(plan).toMatchObject({ diaries: 1, templates: 2, entries: 4, added: RECORDS, updated: 0, unchanged: 0 });
    await applyImport(d.records, plan);
    const back = await collectExportSource(d.diary);
    expect(back.diaries).toEqual(src.diaries);
    expect(sortById(back.templates)).toEqual(sortById(src.templates));
    expect(sortVersions(back.versions)).toEqual(sortVersions(src.versions));
    expect(sortById(back.entries)).toEqual(sortById(src.entries));
    expect(back.savedFilters).toEqual(src.savedFilters);
    expect(back.bodymapImages).toEqual(src.bodymapImages);
  });

  it('EXP-03: zweimaliger Import derselben Datei erzeugt keine Duplikate und keine Änderungen', async () => {
    const d = await device();
    await applyImport(d.records, await planImport(d.records, parseExport(file), { newId: d.newId }));
    const before = await d.db.records.toArray();
    const second = await planImport(d.records, parseExport(file), { newId: d.newId });
    expect(second).toMatchObject({ added: 0, updated: 0, unchanged: RECORDS, writes: [] });
    await applyImport(d.records, second);
    expect(await d.db.records.toArray()).toEqual(before); // gleiche Records, gleiche localUpdatedAt
  });

  it('Import führt nach Merge-Regeln zusammen: neuerer Eintrag gewinnt, älterer überschreibt nicht', async () => {
    const d = await device();
    await applyImport(d.records, await planImport(d.records, parseExport(file), { newId: d.newId }));
    const doc = parseExport(file);
    const e = doc.diaries[0]!.entries[0]!;
    const newer = { ...doc, diaries: [{ ...doc.diaries[0]!, entries: [{ ...e, tags: ['neu'], hlc: '9999999999999:0000:x' }, ...doc.diaries[0]!.entries.slice(1)] }] };
    const plan = await planImport(d.records, newer, { newId: d.newId });
    expect(plan).toMatchObject({ added: 0, updated: 1 });
    await applyImport(d.records, plan);
    expect((await d.diary.getEntry(e.id))?.tags).toEqual(['neu']);
    const older = { ...doc, diaries: [{ ...doc.diaries[0]!, entries: [{ ...e, tags: ['alt'], hlc: '0000000000001:0000:x' }] }] };
    expect(await planImport(d.records, older, { newId: d.newId })).toMatchObject({ updated: 0 });
  });

  it('EXP-04: „Als Kopie importieren" erzeugt neue IDs; alle Referenzen (Vorlage, Block, Option) bleiben konsistent', async () => {
    const d = await device();
    await applyImport(d.records, await planImport(d.records, parseExport(file), { newId: d.newId }));
    const plan = await planImport(d.records, parseExport(file), { asCopy: true, newId: d.newId });
    expect(plan).toMatchObject({ added: RECORDS, updated: 0, unchanged: 0 });
    await applyImport(d.records, plan);
    const diaries = await d.diary.listDiaries();
    expect(diaries).toHaveLength(2);
    const copy = diaries.find((x) => x.id !== src.diaries[0]!.id)!;
    expect(copy.settings.quickEntryTemplateId).not.toBe(src.diaries[0]!.settings.quickEntryTemplateId);
    const templates = await d.diary.listTemplates(copy.id);
    expect(templates.map((t) => t.id)).toContain(copy.settings.quickEntryTemplateId);
    // jeder Eintrag der Kopie lässt sich auflösen (Vorlage/Version vorhanden, Werte gültig gegen die Version)
    const entries = await d.diary.listEntries(copy.id);
    expect(entries).toHaveLength(4);
    for (const e of entries) {
      const view = await d.diary.getEntryView(e.id);
      expect(view?.fields.some((f) => f.value !== undefined)).toBe(true);
      await expect(d.diary.saveEntry(e)).resolves.toBeUndefined();
    }
    const [filter] = await d.diary.listSavedFilters(copy.id);
    const versions = (await d.diary.listAllTemplateVersions()).filter((v) => templates.some((t) => t.id === v.templateId));
    const blockIds = new Set(versions.flatMap((v) => v.blocks.map((b) => b.id)));
    const cond = filter!.filter.conditions![0]! as { blockId: string; optionIds: string[] };
    expect(blockIds.has(cond.blockId)).toBe(true);
    const optionIds = new Set(versions.flatMap((v) => v.blocks.flatMap((b) => (b.type === 'multiselect' ? b.config.options.map((o) => o.id) : []))));
    expect(cond.optionIds.every((o) => optionIds.has(o))).toBe(true);
    expect(filter!.filter.diaryIds).toEqual([copy.id]);
    const images = await d.diary.listBodymapImages(copy.id);
    const mapValue = entries.flatMap((e) => Object.values(e.values)).find((v) => v && typeof v === 'object' && 'presetId' in v) as { presetId: string };
    expect(mapValue.presetId).toBe(images[0]!.id);
  });

  it('EXP-11: ungültige oder manipulierte Importdatei wird mit verständlicher Meldung abgelehnt, die DB bleibt unverändert', async () => {
    const d = await device();
    await applyImport(d.records, await planImport(d.records, parseExport(file), { newId: d.newId }));
    const before = await d.db.records.toArray();
    const doc = JSON.parse(file);
    const e0 = doc.diaries[0].entries[0];
    const firstBlock = Object.keys(e0.values)[0]!;
    const withEntry = (entry: unknown) => JSON.stringify({ ...doc, diaries: [{ ...doc.diaries[0], entries: [entry] }] });
    const bad = [
      withEntry({ ...e0, occurredAt: 'irgendwann' }), // Schema
      withEntry({ ...e0, templateVersion: 7 }), // Referenz fehlt
      withEntry({ ...e0, values: { [firstBlock]: 99 } }), // Wert passt nicht zur Vorlage (Slider 0–10)
      '<html>', // kein JSON
    ];
    const codes: string[] = [];
    for (const text of bad) {
      try {
        await applyImport(d.records, await planImport(d.records, parseExport(text), { newId: d.newId }));
        codes.push('ok');
      } catch (err) {
        expect(err).toBeInstanceOf(ImportError);
        codes.push((err as ImportError).code);
      }
    }
    expect(codes).toEqual(['invalid', 'inconsistent', 'invalid', 'not-json']);
    expect(await d.db.records.toArray()).toEqual(before);
  });
});
