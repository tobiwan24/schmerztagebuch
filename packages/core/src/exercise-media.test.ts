import { describe, expect, it } from 'vitest';
import { parseBlockConfig } from './blocks/index.js';
import { createIdGenerator } from './ids.js';
import { EXERCISE_MEDIA_MAX_BYTES, checkExerciseMediaFile, exerciseMediaIds, exerciseMediaSchema, stepImageId, stepText } from './exercise-media.js';

const { newId } = createIdGenerator({ now: () => 1_700_000_000_000 });
const img = newId();
const vid = newId();

describe('Übungsmedien', () => {
  it('BLK-54: Schritte als Text (alt) und als Text/Bild gemischt; Video-ID optional', () => {
    const c = parseBlockConfig('exercise', { steps: ['Aufrecht stehen', { text: 'Arme heben', imageId: img }, { imageId: img }], videoMediaId: vid });
    expect(c.steps).toHaveLength(3);
    expect(c.steps!.map(stepText)).toEqual(['Aufrecht stehen', 'Arme heben', '']);
    expect(c.steps!.map(stepImageId)).toEqual([undefined, img, img]);
    expect(exerciseMediaIds(c)).toEqual([vid, img, img]);
    expect(exerciseMediaIds(parseBlockConfig('exercise', { steps: ['a'] }))).toEqual([]);
  });

  it('BLK-54: leerer Schritt, ungültige Bild-/Video-ID und fremde Felder werden abgelehnt', () => {
    expect(() => parseBlockConfig('exercise', { steps: [{}] })).toThrow();
    expect(() => parseBlockConfig('exercise', { steps: [{ text: '  ' }] })).toThrow();
    expect(() => parseBlockConfig('exercise', { steps: [{ imageId: 'x' }] })).toThrow();
    expect(() => parseBlockConfig('exercise', { steps: [{ text: 'a', foo: 1 }] })).toThrow();
    expect(() => parseBlockConfig('exercise', { videoMediaId: 'kein-uuid' })).toThrow();
  });

  it('BLK-54: Video mp4/webm/mov und Bilder bis 20 MB, sonst Typ bzw. Größe abgelehnt', () => {
    for (const mime of ['video/mp4', 'video/webm', 'video/quicktime', 'VIDEO/MP4']) expect(checkExerciseMediaFile('video', { mime, sizeBytes: EXERCISE_MEDIA_MAX_BYTES })).toEqual({ ok: true });
    expect(checkExerciseMediaFile('video', { mime: 'video/mp4', sizeBytes: EXERCISE_MEDIA_MAX_BYTES + 1 })).toEqual({ ok: false, reason: 'tooLarge' });
    expect(checkExerciseMediaFile('video', { mime: 'image/png', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
    expect(checkExerciseMediaFile('video', { mime: 'video/x-msvideo', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
    expect(checkExerciseMediaFile('image', { mime: 'image/jpeg', sizeBytes: 10 })).toEqual({ ok: true });
    expect(checkExerciseMediaFile('image', { mime: 'image/svg+xml', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
    expect(checkExerciseMediaFile('image', { mime: 'video/mp4', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
  });

  it('BLK-54: Metadaten-Schema', () => {
    const meta = { id: vid, diaryId: newId(), templateId: newId(), kind: 'video', mime: 'video/mp4', name: 'Übung.mp4', sizeBytes: 1000, createdAt: '2026-11-24T10:00:00.000Z' };
    expect(exerciseMediaSchema.parse(meta)).toEqual(meta);
    expect(() => exerciseMediaSchema.parse({ ...meta, entryId: newId() })).toThrow();
    expect(() => exerciseMediaSchema.parse({ ...meta, sizeBytes: EXERCISE_MEDIA_MAX_BYTES + 1 })).toThrow();
    expect(() => exerciseMediaSchema.parse({ ...meta, kind: 'pdf' })).toThrow();
  });
});
