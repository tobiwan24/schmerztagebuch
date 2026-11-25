// BLK-55: Übungsmedien (RDM-033) im JSON-v1-Export: Schema, Prüfung, Rundweg, „Als Kopie“ (Verweise in der Übungskonfiguration).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import type { BlockDef, ExerciseConfig } from '@stb/core';
import { copyWithNewIds } from './copy.js';
import { FIXTURE_EXPORT_NOW, exportFixture } from './fixture.js';
import { ImportError, buildExport, exportRecords, parseExport, type ExportExerciseMedia } from './json-v1.js';

const schema = JSON.parse(readFileSync(new URL('../schema/stb-export-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const validate = new Ajv2020({ strict: false, validateFormats: false, allErrors: true }).compile(schema);

const VIDEO = '01960000-0000-7000-8000-00000000a001';
const IMAGE = '01960000-0000-7000-8000-00000000a002';
const BLOCK = '01960000-0000-7000-8000-00000000a003';

function withMedia() {
  const s = exportFixture();
  const template = s.templates[0]!;
  const block: BlockDef = {
    id: BLOCK, type: 'exercise', label: 'Schulterkreisen', required: false, order: 'zz',
    config: { steps: ['Aufrecht stehen', { text: 'Arme heben', imageId: IMAGE }], videoMediaId: VIDEO },
  };
  const versions = s.versions.map((v) => (v.templateId === template.id && v.version === template.currentVersion ? { ...v, blocks: [...v.blocks, block] } : v));
  const meta = (id: string, kind: 'image' | 'video', mime: string, dataUrl: string): ExportExerciseMedia => ({
    id, diaryId: template.diaryId, templateId: template.id, kind, mime, name: `${kind}.bin`, sizeBytes: 4, createdAt: '2026-11-24T10:00:00.000Z', dataUrl,
  });
  const media = [meta(VIDEO, 'video', 'video/mp4', 'data:video/mp4;base64,AAAAIA=='), meta(IMAGE, 'image', 'image/png', 'data:image/png;base64,iVBORw==')];
  return { s: { ...s, versions }, media, template };
}

describe('BLK-55: Übungsmedien im Export', () => {
  it('BLK-55: Export enthält die Medien der Vorlagen, validiert gegen das Schema und übersteht den Rundweg', () => {
    const { s, media, template } = withMedia();
    const foreign = { ...media[0]!, id: '01960000-0000-7000-8000-00000000a009', templateId: '01960000-0000-7000-8000-00000000a00a' };
    const doc = buildExport({ ...s, exerciseMedia: [...media, foreign] }, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    expect(doc.diaries[0]!.exerciseMedia).toEqual(media); // Medium ohne vorhandene Vorlage fällt weg
    const json = JSON.parse(JSON.stringify(doc));
    expect(validate(json)).toBe(true);
    const back = parseExport(JSON.stringify(doc));
    expect(exportRecords(back.diaries[0]!).exerciseMedia).toEqual(media);
    expect(back.diaries[0]!.templates.find((t) => t.id === template.id)).toBeDefined();
    // ältere Datei ohne Feld bleibt lesbar
    delete json.diaries[0].exerciseMedia;
    expect(parseExport(JSON.stringify(json)).diaries[0]!.exerciseMedia).toEqual([]);
  });

  it('BLK-55: Medium mit unbekannter Vorlage wird beim Import als inkonsistent abgelehnt', () => {
    const { s, media } = withMedia();
    const json = JSON.parse(JSON.stringify(buildExport({ ...s, exerciseMedia: media }, { appVersion: 't', now: FIXTURE_EXPORT_NOW })));
    json.diaries[0].exerciseMedia[0].templateId = '01960000-0000-7000-8000-00000000a00b';
    expect(() => parseExport(JSON.stringify(json))).toThrow(ImportError);
  });

  it('BLK-55: „Als Kopie“ vergibt neue Medien-IDs und schreibt Video- und Schrittbild-Verweise um', () => {
    const { s, media } = withMedia();
    const doc = buildExport({ ...s, exerciseMedia: media }, { appVersion: 't', now: FIXTURE_EXPORT_NOW });
    let n = 0;
    const copy = copyWithNewIds(doc, () => `01970000-0000-7000-8000-${String(++n).padStart(12, '0')}`);
    const d = copy.diaries[0]!;
    const [video, image] = d.exerciseMedia;
    expect(video!.id).not.toBe(VIDEO);
    expect(image!.id).not.toBe(IMAGE);
    expect(d.templates.map((t) => t.id)).toContain(video!.templateId);
    const block = d.templates.flatMap((t) => t.versions.flatMap((v) => v.blocks)).find((b) => b.type === 'exercise' && b.label === 'Schulterkreisen')!;
    const c = block.config as ExerciseConfig;
    expect(c.videoMediaId).toBe(video!.id);
    expect(c.steps).toEqual(['Aufrecht stehen', { text: 'Arme heben', imageId: image!.id }]);
    expect(() => parseExport(JSON.stringify(copy))).not.toThrow();
  });
});
