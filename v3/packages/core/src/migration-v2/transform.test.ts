import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { canonical } from '../canonical.js';
import { isUuidV7 } from '../ids.js';
import { entrySchemaFor, templateSchema, templateVersionSchema, type Entry, type TemplateVersion } from '../templates.js';
import { bodymapImageSchema } from '../bodymap-image.js';
import { transformV2, type MigrationOptions, type MigrationResult } from './transform.js';
import { buildV2Dump, plainV2Source, V2_ATTACHMENT, V2_FIXTURE_AUTHOR_ID, V2_FIXTURE_DIARY_ID, V2_FIXTURE_TIMEZONE, V2_OWN_IMAGE, V2_PDF, V2_PRESET_IMAGE } from './fixture.js';
import { sha256Hex } from './sha256.js';
import { isoInZone, wallTimeToMs } from './time.js';

const GOLDEN = new URL('../../../../fixtures/migration/v2-transform.json', import.meta.url);

const opts: MigrationOptions = {
  diaryId: V2_FIXTURE_DIARY_ID,
  authorId: V2_FIXTURE_AUTHOR_ID,
  timezone: V2_FIXTURE_TIMEZONE,
  resolveImage: (image, hint) =>
    image === V2_PRESET_IMAGE ? { presetId: hint.defaultPresetId ?? 'default-koerper-vorderseite' } : image === V2_OWN_IMAGE ? { width: 600, height: 800 } : null,
};

const run = (): MigrationResult => transformV2(plainV2Source(buildV2Dump()), opts);
const syncIdOf = (n: number) => `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;

function entryOf(r: MigrationResult, v2Id: number): Entry {
  // v2-ID → v3-ID über die Reihenfolge der Ausgabe nicht verlässlich; über recordedAt eindeutig in der Fixture
  const ts = buildV2Dump().entries.find((e) => e.id === v2Id)!.timestamp;
  const e = r.entries.find((x) => Date.parse(x.recordedAt) === Date.parse(ts));
  if (!e) throw new Error(`Eintrag ${v2Id} fehlt`);
  return e;
}
const versionOf = (r: MigrationResult, e: Entry): TemplateVersion =>
  r.templates.find((t) => t.template.id === e.templateId)!.versions.find((v) => v.version === e.templateVersion)!;
const blockByLabel = (v: TemplateVersion, label: string) => v.blocks.find((b) => b.label === label)!;

describe('Migration v2 → v3: Transformation', () => {
  it('MIG-04: alle v2-Blocktypen ergeben gültige v3-Daten mit den erwarteten Werten (Golden File)', () => {
    const r = run();
    // gültig laut zod
    for (const t of r.templates) {
      templateSchema.parse(t.template);
      for (const v of t.versions) templateVersionSchema.parse({ ...v });
    }
    for (const e of r.entries) entrySchemaFor(versionOf(r, e)).parse(e);
    for (const i of r.bodymapImages) bodymapImageSchema.parse(i);
    expect([...r.templates.flatMap((t) => [t.template.id]), ...r.entries.map((e) => e.id), ...r.attachments.map((a) => a.id)].every(isUuidV7)).toBe(true);

    // Zählung: 4 v2-Vorlagen − 1 gelöschte ohne Einträge + 1 aus Einträgen ohne Vorlage; 10 Einträge − gelöscht − nicht entschlüsselbar
    expect(r.report.counts).toMatchObject({ templates: 4, entries: 8, attachments: 3, bodymapImages: 1, skippedDeleted: 2, undecryptable: 1 });
    expect(r.report.undecryptable).toEqual([{ v2Id: 10, date: '2026-01-15T08:00:00.000Z', reason: 'kein Schlüssel' }]);

    // Datum-Block → occurredAt/period (Gerätezeitzone)
    const e1 = entryOf(r, 1);
    expect(e1.occurredAt).toBe('2026-03-02T08:10:00+01:00');
    expect(e1.period).toBeUndefined();
    expect(e1.meta).toEqual({ source: 'migration-v2', timezone: 'Europe/Berlin' });
    expect(e1.recordedAt).toBe('2026-03-02T08:15:00+01:00');
    const e2 = entryOf(r, 2);
    expect(e2.period).toEqual({ start: '2026-03-03', end: '2026-03-05' });
    expect(e2.occurredAt).toBe('2026-03-03T00:00:00+01:00');
    const e4 = entryOf(r, 4);
    expect(e4.period).toEqual({ start: '2026-03-06T14:00:00+01:00', end: '2026-03-06T16:30:00+01:00' });
    expect(e4.updatedAt).toBe('2026-03-07T08:00:00.000Z');
    expect(entryOf(r, 5).occurredAt).toBe('2025-11-02T12:00:00+01:00'); // Legacy-Datum ohne Uhrzeit → 12:00

    // Werte je Typ
    const v1 = versionOf(r, e1);
    expect(v1.blocks.some((b) => b.label === 'Datum')).toBe(false);
    expect(blockByLabel(v1, 'Schmerzstärke')).toMatchObject({ type: 'slider', role: 'outcome', config: { min: 0, max: 10, step: 1 } });
    expect(blockByLabel(v1, 'Beweglichkeit')).toMatchObject({ role: 'function' });
    expect(blockByLabel(v1, 'Medikamente')).toMatchObject({ type: 'multiselect', role: 'medication' });
    expect(blockByLabel(v1, 'Ort').role).toBeUndefined();
    expect(e1.values[blockByLabel(v1, 'Schmerzstärke').id]).toBe(7);
    expect(e1.values[blockByLabel(v1, 'Sport gemacht').id]).toEqual({ checked: true, note: '20 min Rad' });
    expect(e1.values[blockByLabel(v1, 'Ort').id]).toBe('Büro');
    const notes = e1.values[blockByLabel(v1, 'Notizen').id] as { text: string; events: { category: string; title: string; at: string }[] };
    expect(notes.text).toBe('STB-V2-MARKER Kopf drückt');
    expect(notes.events).toMatchObject([{ category: 'doctor', title: 'Hausarzt', at: '2026-03-02T10:00:00+01:00' }]);
    const map = e1.values[blockByLabel(v1, 'Körperkarte').id] as { presetId: string; points: Record<string, unknown>[] };
    expect(map.presetId).toBe('default-koerper-vorderseite');
    expect(map.points[0]).toMatchObject({ x: 0.5, y: 0.2, intensity: 7, kind: 'point', size: 0.05, comment: 'Stirn' });
    expect(map.points[1]).toMatchObject({ kind: 'brush', size: 0.03, path: [{ x: 0.4, y: 0.6 }, { x: 0.45, y: 0.62 }, { x: 1, y: 0.65 }] });
    expect(map.points[1]!.comment).toBeUndefined();
    expect(e1.values[blockByLabel(v1, 'Beginn der Beschwerden').id]).toEqual({ start: '2026-02-27T00:00:00+01:00', end: '2026-03-01T23:59:00+01:00' });

    // eigenes Body-Map-Bild + Anhänge
    const v2e = versionOf(r, e2);
    const ownMap = e2.values[blockByLabel(v2e, 'Körperkarte').id] as { presetId: string };
    expect(ownMap.presetId).toBe(r.bodymapImages[0]!.id);
    expect(r.bodymapImages[0]).toMatchObject({ dataUrl: V2_OWN_IMAGE, width: 600, height: 800, diaryId: V2_FIXTURE_DIARY_ID });
    const files = (e2.values[blockByLabel(v2e, 'Notizen').id] as { attachmentIds: string[] }).attachmentIds;
    expect(files).toHaveLength(2);
    expect(r.attachments.filter((a) => a.entryId === e2.id)).toMatchObject([
      { name: 'Knie.jpg', kind: 'image', mime: 'image/jpeg', dataUrl: V2_ATTACHMENT },
      { name: 'Befund.pdf', kind: 'pdf', mime: 'application/pdf', dataUrl: V2_PDF },
    ]);

    // gelöschte Vorlage mit Einträgen → archiviert; fehlende Vorlage → archivierte Ersatzvorlage
    expect(r.templates.find((t) => t.template.name === 'Gelöscht mit Einträgen')!.template.archived).toBe(true);
    expect(r.templates.some((t) => t.template.name === 'Gelöscht ohne Einträge')).toBe(false);
    expect(r.templates.find((t) => t.template.name === 'Vorlage 9 (aus v2)')!.template.archived).toBe(true);

    // Golden File (UPDATE_GOLDEN=1 schreibt es neu)
    const json = JSON.stringify(r, null, 2) + '\n';
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
      mkdirSync(new URL('.', GOLDEN), { recursive: true });
      writeFileSync(GOLDEN, json);
    }
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('MIG-04: deterministisch — gleiche Eingabe ergibt dieselben IDs und Daten', () => {
    expect(canonical(run())).toBe(canonical(run()));
    const e1 = entryOf(run(), 1);
    // ID aus v2-syncId + Zeitstempel: Zeitanteil = Erfassungszeit
    expect(parseInt(e1.id.slice(0, 8) + e1.id.slice(9, 13), 16)).toBe(Date.parse('2026-03-02T07:15:00.000Z'));
    expect(syncIdOf(1)).toBe(buildV2Dump().entries[0]!.syncId);
  });

  it('MIG-05: Legacy-image-Blöcke werden zu textarea mit Anhang', () => {
    const r = run();
    const e3 = entryOf(r, 3);
    const v = versionOf(r, e3);
    const foto = blockByLabel(v, 'Foto');
    expect(foto).toMatchObject({ type: 'textarea', config: { allowAttachments: true, allowEvents: true } });
    const value = e3.values[foto.id] as { attachmentIds: string[] };
    expect(value.attachmentIds).toHaveLength(1);
    const att = r.attachments.find((a) => a.id === value.attachmentIds[0])!;
    expect(att).toMatchObject({ entryId: e3.id, kind: 'image', mime: 'image/jpeg', name: 'Foto', dataUrl: V2_ATTACHMENT });
  });

  it('MIG-17: hideLabelInDiary wird zu hideLabel: true am Block der passenden Vorlagenversion', () => {
    const src = plainV2Source(buildV2Dump());
    const tpl = src.templates.find((x) => x.name === 'Schmerz')!;
    const mark = (blocks: typeof tpl.blocks) => blocks.map((b) => (b.type === 'slider' ? { ...b, hideLabelInDiary: true } : { ...b, hideLabelInDiary: false }));
    const hidden = transformV2(
      {
        templates: src.templates.map((x) => (x.id === tpl.id ? { ...x, blocks: mark(x.blocks) } : x)),
        entries: src.entries.map((e) => (e.templateId === tpl.id && e.blocks ? { ...e, blocks: mark(e.blocks) } : e)),
      },
      opts,
    );
    const versions = hidden.templates.find((x) => x.template.name === 'Schmerz')!.versions;
    expect(versions.length).toBeGreaterThan(1);
    for (const v of versions) {
      for (const b of v.blocks) {
        if (b.type === 'slider') expect(b.hideLabel).toBe(true);
        else expect(b).not.toHaveProperty('hideLabel');
      }
    }
    // ohne das v2-Flag entsteht nirgends hideLabel
    for (const t of run().templates) for (const v of t.versions) for (const b of v.blocks) expect(b).not.toHaveProperty('hideLabel');
  });

  it('MIG-06: Einträge mit geänderter v2-Vorlage bekommen eine eigene Vorlagenversion; Werte bleiben am richtigen Block', () => {
    const r = run();
    const t = r.templates.find((x) => x.template.name === 'Schmerz')!;
    expect(t.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(t.template.currentVersion).toBe(2);
    const e3 = entryOf(r, 3);
    expect(e3.templateVersion).toBe(1);
    const old = t.versions[0]!;
    expect(old.blocks.map((b) => b.label)).toEqual(['Schmerz', 'Medikamente', 'Foto']);
    expect(blockByLabel(old, 'Schmerz')).toMatchObject({ type: 'slider', config: { max: 5 } });
    // derselbe v2-Block → dieselbe v3-Block-ID in beiden Versionen; Wert 4 bleibt am Schmerz-Slider
    const current = t.versions[1]!;
    expect(blockByLabel(old, 'Schmerz').id).toBe(blockByLabel(current, 'Schmerzstärke').id);
    expect(e3.values[blockByLabel(old, 'Schmerz').id]).toBe(4);
    expect(Object.keys(e3.values).every((id) => old.blocks.some((b) => b.id === id))).toBe(true);
    // Einträge der aktuellen Fassung bleiben auf der aktuellen Version
    for (const n of [1, 2, 9]) expect(entryOf(r, n).templateVersion).toBe(2);
    // Mapping-Tabelle im Bericht
    expect(r.report.blockMap[`00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000102/slider`]).toBe(blockByLabel(current, 'Schmerzstärke').id);
  });

  it('MIG-07: Multiselect — bekannte Labels → Options-IDs, unbekannte → neue Option „(aus v2) …“, Indizes → Option', () => {
    const r = run();
    const e4 = entryOf(r, 4);
    const v4 = versionOf(r, e4);
    const meds = blockByLabel(v4, 'Medikamente');
    if (meds.type !== 'multiselect') throw new Error('kein Multiselect');
    expect(meds.config.options.map((o) => o.label)).toEqual(['Ibuprofen', 'Paracetamol', '(aus v2) Novalgin']);
    const ids = e4.values[meds.id] as string[];
    expect(ids.map((id) => meds.config.options.find((o) => o.id === id)!.label)).toEqual(['Paracetamol', '(aus v2) Novalgin']);
    expect(r.report.unknownValues).toContainEqual({ date: '2026-03-06', template: 'Schmerz', block: 'Medikamente', value: 'Novalgin' });
    // Optionen behalten ihre IDs über Versionen (gleiches Label → gleiche ID)
    const current = r.templates.find((t) => t.template.id === e4.templateId)!.versions.at(-1)!;
    const curMeds = blockByLabel(current, 'Medikamente');
    if (curMeds.type !== 'multiselect') throw new Error('kein Multiselect');
    expect(curMeds.config.options.find((o) => o.label === 'Paracetamol')!.id).toBe(meds.config.options.find((o) => o.label === 'Paracetamol')!.id);

    // alte `options`-Liste + Index-Wert
    const e5 = entryOf(r, 5);
    const v5 = versionOf(r, e5);
    const trig = blockByLabel(v5, 'Auslöser');
    if (trig.type !== 'multiselect') throw new Error('kein Multiselect');
    expect((e5.values[trig.id] as string[]).map((id) => trig.config.options.find((o) => o.id === id)!.label)).toEqual(['Wetter', 'Stress']);
    expect(e5.values[blockByLabel(v5, 'Kopfschmerz').id]).toEqual({ checked: true });
    expect(e5.values[blockByLabel(v5, 'Puls').id]).toBe('72');
  });

  it('Werte außerhalb der Skala landen im Bericht, der Rest des Eintrags bleibt', () => {
    const r = run();
    const e9 = entryOf(r, 9);
    const v = versionOf(r, e9);
    expect(e9.values[blockByLabel(v, 'Schmerzstärke').id]).toBeUndefined();
    expect(e9.values[blockByLabel(v, 'Ort').id]).toBe('Zuhause');
    expect(r.report.unknownValues).toEqual(
      expect.arrayContaining([
        { date: '2026-03-09', template: 'Schmerz', block: 'Schmerzstärke', value: '11' },
        { date: '2026-03-09', template: 'Schmerz', block: 'Beweglichkeit', value: '2.5' },
      ]),
    );
  });
});

describe('Migration-Hilfen', () => {
  it('SHA-256 entspricht den Testvektoren', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('Wandzeit → Zeitpunkt in der Zeitzone, auch an Zeitumstellungen', () => {
    const tz = 'Europe/Berlin';
    expect(isoInZone(wallTimeToMs('2026-01-10', '08:00', tz)!, tz)).toBe('2026-01-10T08:00:00+01:00');
    expect(isoInZone(wallTimeToMs('2026-07-10', '08:00', tz)!, tz)).toBe('2026-07-10T08:00:00+02:00');
    expect(isoInZone(wallTimeToMs('2026-03-29', '02:30', tz)!, tz)).toBe('2026-03-29T03:30:00+02:00'); // Lücke → später
    expect(isoInZone(wallTimeToMs('2026-03-02', '00:00', 'UTC')!, 'UTC')).toBe('2026-03-02T00:00:00Z');
    expect(wallTimeToMs('2026-02-30', '08:00', tz)).toBeUndefined();
    expect(wallTimeToMs('2026-02-10', '25:00', tz)).toBeUndefined();
  });
});
