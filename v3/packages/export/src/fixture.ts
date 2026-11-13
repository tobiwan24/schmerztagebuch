// Export-Fixture (synthetisch, gültige UUID v7): zwei Katalog-Vorlagen (eine mit Version 2), Einträge mit Zeitraum,
// Optionen, Ereignis und eigenem Body-Map-Bild, ein gespeicherter Filter. Für Export-/Import-Tests (EXP-01 … EXP-11).
import {
  createDiary, createIdGenerator, instantiateCatalogTemplate, keyBetween, updateTemplate,
  type BodymapImage, type Entry, type TemplateVersion,
} from '@stb/core';
import type { SavedFilter } from '@stb/analysis';
import type { ExportSource } from './json-v1.js';

export function exportFixture(): ExportSource {
  let t = Date.parse('2026-02-01T08:00:00.000Z');
  const clock = { now: () => (t += 60_000) };
  // Deterministischer Zufall → stabile IDs (Golden Files, EXP-05)
  let seed = 0x5eed;
  const random = {
    fill: (b: Uint8Array) => {
      for (let i = 0; i < b.length; i++) b[i] = ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff;
      return b;
    },
  };
  const { newId } = createIdGenerator(clock, random);
  const diary = createDiary({ id: newId(), name: 'Testtagebuch', subject: 'human', timezone: 'Europe/Berlin' }, clock);
  const k1 = keyBetween(null, null);
  const migraine1 = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: diary.id, order: k1, newId }, clock);
  const general = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId: diary.id, order: keyBetween(k1, null), newId }, clock);
  // Version 2: Label geändert (Werte alter Einträge bleiben über die Block-ID auswertbar)
  const migraine2 = updateTemplate(migraine1, { blocks: migraine1.version.blocks.map((b, i) => (i === 0 ? { ...b, label: 'Schmerzstärke (0–10)' } : b)) }, clock).state;

  const [pain, symptoms, , triggers, notes] = migraine1.version.blocks;
  const opt = (b: typeof symptoms, i: number) => (b?.type === 'multiselect' ? b.config.options[i]!.id : '');
  const [gPain, gMap, gNotes] = general.version.blocks;

  const image: BodymapImage = {
    id: newId(), diaryId: diary.id, name: 'Knie links', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', width: 600, height: 800,
    createdAt: new Date(clock.now()).toISOString(),
  };
  const stamp = () => {
    const at = new Date(clock.now()).toISOString();
    return { at, hlc: `${String(Date.parse(at)).padStart(13, '0')}:0000:fixture` };
  };
  const entry = (tpl: { template: { id: string }; version: TemplateVersion }, occurredAt: string, values: Record<string, unknown>, extra: Partial<Entry> = {}): Entry => {
    const s = stamp();
    return {
      id: newId(), diaryId: diary.id, templateId: tpl.template.id, templateVersion: tpl.version.version, occurredAt, recordedAt: s.at, updatedAt: s.at,
      authorId: 'local-user', values, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: s.hlc, ...extra,
    };
  };
  const entries: Entry[] = [
    entry(migraine1, '2026-02-03T07:30:00.000Z', { [pain!.id]: 7, [symptoms!.id]: [opt(symptoms, 0), opt(symptoms, 2)], [notes!.id]: { text: 'Übelkeit, "laut"; Zeile\nzwei' } }, { tags: ['arbeit'] }),
    entry(migraine1, '2026-02-04T00:00:00.000Z', { [pain!.id]: 5, [triggers!.id]: [opt(triggers, 1)] }, { period: { start: '2026-02-04', end: '2026-02-06' } }),
    entry(migraine2, '2026-02-10T18:00:00.000Z', { [pain!.id]: 3, [notes!.id]: { events: [{ id: newId(), category: 'doctor', title: 'Neurologie' }] } }, { meta: { source: 'quick', timezone: 'Europe/Berlin' } }),
    entry(general, '2026-02-11T09:15:00.000Z', {
      [gPain!.id]: 8, [gMap!.id]: { presetId: image.id, points: [{ id: newId(), x: 0.4, y: 0.6, intensity: 8, kind: 'point', size: 0.05, comment: '=SUMME(A1)' }] },
      [gNotes!.id]: { text: '+49 Notiz' },
    }),
  ];
  const s = stamp();
  const savedFilter: SavedFilter = {
    id: newId(), diaryId: diary.id, name: 'Übelkeit', hlc: s.hlc, updatedAt: s.at,
    filter: { diaryIds: [diary.id], templateIds: [migraine1.template.id], range: { preset: 'all' }, conditions: [{ kind: 'option', blockId: symptoms!.id, optionIds: [opt(symptoms, 0)], mode: 'any' }] },
  };
  return {
    diaries: [{ ...diary, settings: { ...diary.settings, quickEntryTemplateId: migraine1.template.id, quickEntryBlockIds: [pain!.id] } }],
    templates: [migraine2.template, general.template],
    versions: [migraine1.version, migraine2.version, general.version],
    entries,
    savedFilters: [savedFilter],
    bodymapImages: [image],
  };
}

export const FIXTURE_EXPORT_NOW = Date.parse('2026-03-01T12:00:00.000Z');
