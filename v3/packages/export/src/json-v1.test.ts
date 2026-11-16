import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { BLOCK_TYPES, ROLES, createIdGenerator, entrySchemaFor } from '@stb/core';
import { WEATHER_FIELD_NAMES } from '@stb/analysis';
import { GLOSSARY, ImportError, buildExport, exportJsonSchema, exportRecords, parseExport } from './json-v1.js';
import { copyWithNewIds } from './copy.js';
import { FIXTURE_EXPORT_NOW, exportFixture } from './fixture.js';

const src = exportFixture();
const doc = buildExport(src, { appVersion: '3.0.0-test', now: FIXTURE_EXPORT_NOW });
const schemaFile = JSON.parse(readFileSync(new URL('../schema/stb-export-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;

describe('JSON v1', () => {
  it('EXP-01: JSON-v1-Export der Fixture validiert gegen das veröffentlichte JSON Schema', () => {
    // veröffentlichtes Schema ist aktuell (aus zod generiert: node scripts/gen-export-schema.mjs)
    expect(schemaFile).toEqual(JSON.parse(JSON.stringify(exportJsonSchema())));
    const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
    const validate = ajv.compile(schemaFile);
    const ok = validate(JSON.parse(JSON.stringify(doc)));
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
    // Gegenprobe: das Schema lehnt Kaputtes ab
    expect(validate({ ...doc, format: 'anderes' })).toBe(false);
    expect(validate({ ...doc, diaries: [{ ...doc.diaries[0], entries: [{ id: 'x' }] }] })).toBe(false);
  });

  it('BLK-43: hideLabel steht im veröffentlichten JSON Schema, übersteht Export und Import-Prüfung', () => {
    const d = structuredClone(doc);
    const v = d.diaries[0]!.templates[0]!.versions[0]!;
    v.blocks[0] = { ...v.blocks[0]!, hideLabel: true };
    const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
    expect(ajv.compile(schemaFile)(JSON.parse(JSON.stringify(d)))).toBe(true);
    const back = parseExport(JSON.stringify(d));
    expect(back.diaries[0]!.templates[0]!.versions[0]!.blocks[0]).toMatchObject({ hideLabel: true });
    const bad = structuredClone(d);
    (bad.diaries[0]!.templates[0]!.versions[0]!.blocks[0] as Record<string, unknown>).hideLabel = 'ja';
    expect(ajv.compile(schemaFile)(JSON.parse(JSON.stringify(bad)))).toBe(false);
  });

  it('Export ist selbstbeschreibend und vollständig', () => {
    expect(doc).toMatchObject({ format: 'stb-export', formatVersion: 1, exportedAt: '2026-03-01T12:00:00.000Z', appVersion: '3.0.0-test' });
    const d = doc.diaries[0]!;
    expect(d.templates.map((t) => t.versions.map((v) => v.version))).toEqual([[1, 2], [1]]);
    expect(d.entries).toHaveLength(4);
    expect(d.savedFilters).toHaveLength(1);
    expect(d.bodymapImages).toHaveLength(1);
    expect(Object.keys(GLOSSARY.blockTypes).sort()).toEqual([...BLOCK_TYPES].sort());
    expect(Object.keys(GLOSSARY.roles).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(GLOSSARY.weatherFields).sort()).toEqual([...WEATHER_FIELD_NAMES].sort());
  });

  it('EXP-07: gefilterter Export enthält genau die Einträge des Filters und den Filter selbst', () => {
    const filter = src.savedFilters[0]!.filter; // Migräne-Vorlage, Option „Übelkeit"
    const filtered = buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW, filter });
    expect(filtered.filter).toEqual(filter);
    expect(filtered.diaries[0]!.entries.map((e) => e.id)).toEqual([src.entries[0]!.id]);
    const byQuick = buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW, filter: { diaryIds: [src.diaries[0]!.id], range: { preset: 'all' }, conditions: [{ kind: 'meta', field: 'source', value: 'quick' }] } });
    expect(byQuick.diaries[0]!.entries.map((e) => e.id)).toEqual([src.entries[2]!.id]);
    // Vorlagen bleiben vollständig, damit die Einträge auswertbar bleiben
    expect(byQuick.diaries[0]!.templates).toHaveLength(2);
  });

  it('Import-Prüfung: verständliche Fehlercodes für ungültige Dateien', () => {
    const text = JSON.stringify(doc);
    expect(parseExport(text)).toEqual(JSON.parse(text));
    const code = (s: string) => {
      try {
        parseExport(s);
        return 'ok';
      } catch (e) {
        return (e as ImportError).code;
      }
    };
    expect(code('{kaputt')).toBe('not-json');
    expect(code(JSON.stringify({ format: 'v2-backup' }))).toBe('wrong-format');
    expect(code(JSON.stringify({ ...doc, formatVersion: 2 }))).toBe('newer-version');
    expect(code(JSON.stringify({ ...doc, exportedAt: 'gestern' }))).toBe('invalid');
    const orphan = { ...doc, diaries: [{ ...doc.diaries[0]!, entries: [{ ...doc.diaries[0]!.entries[0]!, templateVersion: 9 }] }] };
    expect(code(JSON.stringify(orphan))).toBe('inconsistent');
  });

  it('Als Kopie: neue IDs, Verweise konsistent (Unit)', () => {
    let t = 0;
    const { newId } = createIdGenerator({ now: () => (t += 1) + 1_800_000_000_000 });
    const copy = copyWithNewIds(doc, newId);
    const a = exportRecords(doc.diaries[0]!);
    const b = exportRecords(copy.diaries[0]!);
    const oldIds = new Set([a.diary.id, ...a.templates.map((x) => x.id), ...a.entries.map((x) => x.id), ...a.bodymapImages.map((x) => x.id), ...a.savedFilters.map((x) => x.id)]);
    for (const id of [b.diary.id, ...b.templates.map((x) => x.id), ...b.entries.map((x) => x.id), ...b.bodymapImages.map((x) => x.id), ...b.savedFilters.map((x) => x.id)]) expect(oldIds.has(id)).toBe(false);
    // jeder kopierte Eintrag ist gegen seine kopierte Vorlagenversion gültig (Blöcke und Optionen umgeschrieben)
    for (const e of b.entries) {
      const v = b.versions.find((x) => x.templateId === e.templateId && x.version === e.templateVersion)!;
      expect(entrySchemaFor(v).safeParse(e).success).toBe(true);
    }
    expect(JSON.stringify(copy)).not.toContain(a.diary.id);
  });
});
