import { describe, expect, it } from 'vitest';
import { instantiateCatalogTemplate } from './catalog.js';
import { createDiary } from './diary.js';
import { keyBetween } from './fractional-index.js';
import { createIdGenerator } from './ids.js';
import { quickEntrySelection } from './quick-entry.js';
import type { TemplateState } from './templates.js';

const clock = { now: () => Date.parse('2026-03-01T08:00:00Z') };
const { newId } = createIdGenerator(clock);
const diary = createDiary({ id: newId(), name: 'T', subject: 'human', timezone: 'UTC' }, clock);
const k1 = keyBetween(null, null);
const k2 = keyBetween(k1, null);
const make = (catalogId: string, order: string): TemplateState =>
  instantiateCatalogTemplate(catalogId, { id: newId(), diaryId: diary.id, order, newId }, clock);

describe('Schnelleintrag-Auswahl', () => {
  it('Standard: erste Vorlage nach Reihenfolge, alle outcome-Blöcke', () => {
    const migraine = make('migraine', k2);
    const general = make('general-pain', k1);
    const sel = quickEntrySelection(diary, [migraine, general])!;
    expect(sel.state.template.id).toBe(general.template.id);
    expect(sel.blocks.map((b) => b.label)).toEqual(['Schmerzstärke']);
  });

  it('ohne outcome-Block der erste Slider; archivierte Vorlagen zählen nicht; ohne Vorlage null', () => {
    const chronic = make('chronic-pain', k1);
    const noOutcome = { ...chronic, version: { ...chronic.version, blocks: chronic.version.blocks.map((b) => {
      const c = { ...b };
      delete c.role;
      return c;
    }) } };
    expect(quickEntrySelection(diary, [noOutcome])!.blocks.map((b) => b.label)).toEqual(['Schmerzstärke']);
    const archived = { ...chronic, template: { ...chronic.template, archived: true } };
    expect(quickEntrySelection(diary, [archived])).toBeNull();
  });

  it('Einstellung des Tagebuchs: Vorlage und Blöcke', () => {
    const general = make('general-pain', k1);
    const chronic = make('chronic-pain', k2);
    const sleep = chronic.version.blocks.find((b) => b.label === 'Schlafqualität')!;
    const d = { ...diary, settings: { ...diary.settings, quickEntryTemplateId: chronic.template.id, quickEntryBlockIds: [sleep.id] } };
    const sel = quickEntrySelection(d, [general, chronic])!;
    expect(sel.state.template.id).toBe(chronic.template.id);
    expect(sel.blocks.map((b) => b.id)).toEqual([sleep.id]);
  });
});
