import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { keyBetween } from './fractional-index.js';
import { DEFAULT_BODYMAP_PRESET_ID } from './catalog.js';
import { createDiary, diarySchema, isLibraryDiary } from './diary.js';
import { newBlock } from './template-editor.js';
import { catalogCopyOf, catalogEntryFrom, instantiateFromCatalog, pickLibrary, refreshCatalogCopy } from './template-catalog.js';
import { createTemplate, templateSchema, templateVersionSchema, type BlockDef, type TemplateState } from './templates.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const ids = createIdGenerator(clock);

const allIds = (blocks: readonly BlockDef[]): string[] =>
  blocks.flatMap((b) => [
    b.id,
    ...(b.type === 'multiselect' ? b.config.options.map((o) => o.id) : []),
    ...(b.type === 'medication' ? b.config.presets.map((p) => p.id) : []),
    ...(b.type === 'exercise' ? (b.config.levels ?? []).map((l) => l.id) : []),
  ]);

function source(): { state: TemplateState; ownImage: string; video: string; stepImage: string } {
  const ownImage = ids.newId();
  const video = ids.newId();
  const stepImage = ids.newId();
  const ms = { ...newBlock('multiselect', ids), label: 'Symptome' } as BlockDef;
  const sl = { ...newBlock('slider', ids, ms.order), label: 'Schmerz' } as BlockDef;
  const bm = { ...newBlock('bodymap', ids, sl.order), label: 'Ort', config: { defaultPresetId: ownImage } } as BlockDef;
  const ex = {
    ...newBlock('exercise', ids, bm.order),
    label: 'Übung',
    config: { videoMediaId: video, steps: ['Aufstehen', { text: 'Strecken', imageId: stepImage }], levels: [{ id: ids.newId(), label: 'leicht' }] },
  } as BlockDef;
  const state = createTemplate(
    { id: ids.newId(), diaryId: ids.newId(), name: 'Migräne', icon: 'Zap', color: 'red', order: keyBetween(null, null), quickBlockIds: [sl.id], blocks: [ms, sl, bm, ex] },
    clock,
  );
  return { state, ownImage, video, stepImage };
}

describe('Vorlagenkatalog (RDM-034)', () => {
  it('BLK-61: catalogCopyOf vergibt neue IDs, Version 1, bildet quickBlockIds ab und setzt catalogSource', () => {
    const { state, ownImage, video, stepImage } = source();
    const library = ids.newId();
    const { state: copy, mediaIds } = catalogCopyOf(state, { diaryId: library, order: keyBetween(null, null), ids }, clock, {
      ownBodymapImageIds: new Set([ownImage]),
      copyableMediaIds: new Set([video, stepImage]),
    });
    expect(templateSchema.safeParse(copy.template).success).toBe(true);
    expect(templateVersionSchema.safeParse(copy.version).success).toBe(true);
    expect(copy.template.diaryId).toBe(library);
    expect(copy.template.id).not.toBe(state.template.id);
    expect(copy.template.currentVersion).toBe(1);
    expect(copy.template.archived).toBe(false);
    expect(copy.template.name).toBe('Migräne');
    expect(copy.template.catalogSource).toEqual({ diaryId: state.template.diaryId, templateId: state.template.id, version: 1 });
    const orig = new Set(allIds(state.version.blocks));
    const fresh = allIds(copy.version.blocks);
    expect(fresh).toHaveLength(orig.size);
    expect(fresh.some((id) => orig.has(id))).toBe(false);
    const slider = copy.version.blocks.find((b) => b.type === 'slider')!;
    expect(copy.template.quickBlockIds).toEqual([slider.id]);
    // Body-Map mit eigenem Bild des Quell-Tagebuchs → Standardbild
    const bm = copy.version.blocks.find((b) => b.type === 'bodymap')!;
    expect(bm.type === 'bodymap' && bm.config.defaultPresetId).toBe(DEFAULT_BODYMAP_PRESET_ID);
    // Übungsmedien bekommen neue IDs
    const ex = copy.version.blocks.find((b) => b.type === 'exercise')!;
    if (ex.type !== 'exercise') throw new Error();
    expect(ex.config.videoMediaId).toBe(mediaIds.get(video));
    expect(ex.config.steps).toEqual(['Aufstehen', { text: 'Strecken', imageId: mediaIds.get(stepImage) }]);
    expect(mediaIds.size).toBe(2);
  });

  it('BLK-61: nicht kopierbare Übungsmedien entfallen, Schritt-Text bleibt; Standard-Presets bleiben', () => {
    const { state } = source();
    const { state: copy, mediaIds } = catalogCopyOf(state, { diaryId: ids.newId(), order: keyBetween(null, null), ids }, clock, { copyableMediaIds: new Set() });
    const ex = copy.version.blocks.find((b) => b.type === 'exercise')!;
    if (ex.type !== 'exercise') throw new Error();
    expect(ex.config.videoMediaId).toBeUndefined();
    expect(ex.config.steps).toEqual(['Aufstehen', { text: 'Strecken' }]);
    expect(mediaIds.size).toBe(0);
    const bm = copy.version.blocks.find((b) => b.type === 'bodymap')!;
    // ohne ownBodymapImageIds unverändert
    expect(bm.type === 'bodymap' && bm.config.defaultPresetId).toBe((state.version.blocks.find((b) => b.type === 'bodymap') as Extract<BlockDef, { type: 'bodymap' }>).config.defaultPresetId);
  });

  it('BLK-61: instantiateFromCatalog legt eine unabhängige Vorlage ohne catalogSource an', () => {
    const { state } = source();
    const { state: entry } = catalogCopyOf(state, { diaryId: ids.newId(), order: keyBetween(null, null), ids }, clock);
    const target = ids.newId();
    const { state: inst } = instantiateFromCatalog(entry, { diaryId: target, order: 'a1', ids }, clock);
    expect(inst.template.catalogSource).toBeUndefined();
    expect(inst.template.diaryId).toBe(target);
    expect(inst.template.order).toBe('a1');
    expect(inst.template.currentVersion).toBe(1);
    const before = new Set([...allIds(entry.version.blocks), ...allIds(state.version.blocks)]);
    expect(allIds(inst.version.blocks).some((id) => before.has(id))).toBe(false);
    expect(templateSchema.safeParse(inst.template).success).toBe(true);
  });

  it('BLK-61: refreshCatalogCopy schreibt neue Version mit Blöcken der Quelle und aktualisiert catalogSource', () => {
    const { state } = source();
    const { state: entry } = catalogCopyOf(state, { diaryId: ids.newId(), order: keyBetween(null, null), ids }, clock);
    const changed: TemplateState = {
      template: { ...state.template, name: 'Migräne neu', currentVersion: 2 },
      version: { ...state.version, version: 2, blocks: state.version.blocks.slice(0, 2) },
    };
    const { state: next } = refreshCatalogCopy(entry, changed, ids, clock, [entry.version]);
    expect(next.template.id).toBe(entry.template.id);
    expect(next.template.name).toBe('Migräne neu');
    expect(next.template.currentVersion).toBe(2);
    expect(next.version.blocks).toHaveLength(2);
    expect(next.template.catalogSource).toEqual({ diaryId: state.template.diaryId, templateId: state.template.id, version: 2 });
    expect(catalogEntryFrom([next.template], state.template.id)?.id).toBe(entry.template.id);
  });

  it('DM-20: Diary.purpose und Template.catalogSource sind optional, alte Daten gültig, unbekannte Werte abgelehnt', () => {
    const old = createDiary({ id: ids.newId(), name: 'A', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    expect(old.purpose).toBeUndefined();
    expect(isLibraryDiary(old)).toBe(false);
    const lib = createDiary({ id: ids.newId(), name: 'Bibliothek', subject: 'other', timezone: 'Europe/Berlin', purpose: 'library' }, clock);
    expect(isLibraryDiary(lib)).toBe(true);
    expect(diarySchema.safeParse({ ...old, purpose: 'x' }).success).toBe(false);
    const { state } = source();
    expect(templateSchema.safeParse(state.template).success).toBe(true);
    expect(templateSchema.safeParse({ ...state.template, catalogSource: { diaryId: 'x' } }).success).toBe(false);
  });

  it('DM-20: pickLibrary wählt bei zwei Bibliotheken die älteste (createdAt, dann ID)', () => {
    const a = { id: 'b-id', createdAt: '2026-01-02T00:00:00.000Z', purpose: 'library' as const };
    const b = { id: 'a-id', createdAt: '2026-01-02T00:00:00.000Z', purpose: 'library' as const };
    const c = { id: 'c-id', createdAt: '2026-01-03T00:00:00.000Z', purpose: 'library' as const };
    const d = { id: '0', createdAt: '2025-01-01T00:00:00.000Z' };
    expect(pickLibrary([c, a, b, d])?.id).toBe('a-id');
    expect(pickLibrary([d])).toBeUndefined();
  });
});
