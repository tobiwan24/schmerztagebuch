// BLK-52: purpose/functionPhases im Export-Schema (JSON v1) und im Import-Roundtrip; ältere Exporte ohne die Felder bleiben gültig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { copyWithNewIds } from './copy.js';
import { FIXTURE_EXPORT_NOW, exportFixture } from './fixture.js';
import { buildExport, parseExport } from './json-v1.js';

const schema = JSON.parse(readFileSync(new URL('../schema/stb-export-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const validate = new Ajv2020({ strict: false, validateFormats: false, allErrors: true }).compile(schema);

describe('BLK-52: Trainingsvorlagen im Export', () => {
  it('BLK-52: Schema und Roundtrip mit purpose/functionPhases; Export ohne die Felder bleibt gültig', () => {
    const s = exportFixture();
    const plain = JSON.parse(JSON.stringify(buildExport(s, { appVersion: 't', now: FIXTURE_EXPORT_NOW })));
    expect(validate(plain)).toBe(true);

    const templates = s.templates.map((t, i) => (i === 0 ? { ...t, purpose: 'training' as const, functionPhases: [1, 2] } : t));
    const doc = buildExport({ ...s, templates }, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    const json = JSON.parse(JSON.stringify(doc));
    expect(validate(json)).toBe(true);
    const back = parseExport(JSON.stringify(doc));
    expect(back.diaries[0]!.templates[0]).toMatchObject({ purpose: 'training', functionPhases: [1, 2] });
    expect(back).toEqual(json);
    // ungültiger Zweck wird vom Schema abgelehnt
    json.diaries[0].templates[0].purpose = 'sport';
    expect(validate(json)).toBe(false);
  });

  it('BLK-52: „Als Kopie“ behält purpose und functionPhases', () => {
    const s = exportFixture();
    const templates = s.templates.map((t, i) => (i === 0 ? { ...t, purpose: 'training' as const, functionPhases: [3] } : t));
    const doc = buildExport({ ...s, templates }, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    let n = 0;
    const copy = copyWithNewIds(doc, () => `01960000-0000-7000-8000-${String(++n).padStart(12, '0')}`);
    expect(copy.diaries[0]!.templates[0]).toMatchObject({ purpose: 'training', functionPhases: [3] });
  });
});
