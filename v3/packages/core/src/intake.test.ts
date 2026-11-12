import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { instantiateCatalogTemplate } from './catalog.js';
import { mapIntakeToValues, buildShortcutPrompt, normalizeLabel } from './intake.js';
import type { BlockDef } from './templates.js';

const clock = { now: () => 1_700_000_000_000 };
const { newId } = createIdGenerator(clock);
const state = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: newId(), order: 'V', newId }, clock);
const byLabel = (label: string) => state.version.blocks.find((b) => b.label === label) as BlockDef;
const pain = byLabel('Schmerzstärke');
const symptoms = byLabel('Begleitsymptome');
const duration = byLabel('Dauer (Stunden)');
const notes = byLabel('Notizen');
const optionId = (b: BlockDef, label: string) => (b.type === 'multiselect' ? b.config.options.find((o) => o.label === label)!.id : '');

describe('Kurzbefehl-Zuordnung', () => {
  it('VOI-06: Zuordnung über Block-ID und über Label (Groß/Klein und Umlaute tolerant)', () => {
    const r = mapIntakeToValues({ values: { [pain.id]: 6, 'dauer (stunden)': '3' } }, state.version);
    expect(r.values[pain.id]).toBe(6);
    expect(r.values[duration.id]).toBe(3);
    const r2 = mapIntakeToValues({ values: { SCHMERZSTAERKE: 4 } }, state.version);
    expect(r2.values[pain.id]).toBe(4);
    expect(normalizeLabel('Übelkeit')).toBe(normalizeLabel('uebelkeit'));
    expect(normalizeLabel('Übelkeit')).toBe(normalizeLabel('ubelkeit'));
  });

  it('VOI-06: Multiselect-Werte werden über Options-Labels aufgelöst (tolerant)', () => {
    const r = mapIntakeToValues({ values: { Begleitsymptome: ['uebelkeit', 'AURA'] } }, state.version);
    expect(r.values[symptoms.id]).toEqual([optionId(symptoms, 'Übelkeit'), optionId(symptoms, 'Aura')]);
    const single = mapIntakeToValues({ values: { begleitsymptome: 'Lichtempfindlichkeit' } }, state.version);
    expect(single.values[symptoms.id]).toEqual([optionId(symptoms, 'Lichtempfindlichkeit')]);
    expect(r.errors).toEqual([]);
  });

  it('VOI-06: nicht zuordenbare Werte und Freitext landen in der Notiz (erster textarea-Block)', () => {
    const r = mapIntakeToValues({ text: 'nach dem Joggen', values: { Wetter: 'Föhn', schmerzstaerke: 5 } }, state.version);
    expect(r.values[pain.id]).toBe(5);
    expect(r.values[notes.id]).toEqual({ text: 'nach dem Joggen\nWetter: Föhn' });
    expect(r.unmatched).toEqual([{ key: 'Wetter', value: 'Föhn' }]);
    expect(r.tags).toEqual([]);
  });

  it('VOI-06: ohne textarea-Block → Tag „Kurzbefehl" und Notiztext als Rest', () => {
    const noNotes = { ...state.version, blocks: state.version.blocks.filter((b) => b.type !== 'textarea') };
    const r = mapIntakeToValues({ text: 'frei', values: { foo: 1 } }, noNotes);
    expect(r.tags).toEqual(['Kurzbefehl']);
    expect(r.note).toBe('frei\nfoo: 1');
  });

  it('VOI-06: ungültige Werte werden als Fehler gemeldet statt still verworfen', () => {
    const r = mapIntakeToValues({ values: { Schmerzstärke: 11, Begleitsymptome: ['Zahnweh'], 'Dauer (Stunden)': 'viel' } }, state.version);
    expect(r.errors.map((e) => e.blockId).sort()).toEqual([pain.id, symptoms.id, duration.id].sort());
    expect(r.values[pain.id]).toBeUndefined();
  });
});

describe('Kurzbefehl-Prompt', () => {
  it('VOI-08: enthält alle Blöcke der aktuellen Version mit ID, Typ, Bereich und Optionen', () => {
    const prompt = buildShortcutPrompt(state.template.name, state.version);
    for (const b of state.version.blocks) {
      expect(prompt).toContain(b.id);
      expect(prompt).toContain(b.type);
      expect(prompt).toContain(b.label);
    }
    expect(prompt).toContain('"min": 0');
    expect(prompt).toContain('"max": 72');
    expect(prompt).toContain('"step": 1');
    for (const label of ['Übelkeit', 'Aura', 'Lichtempfindlichkeit', 'Lärmempfindlichkeit', 'Stress', 'Hormone']) expect(prompt).toContain(label);
    expect(prompt).toContain('occurredAt');
    // Der JSON-Teil ist gültiges JSON
    const json = prompt.slice(prompt.indexOf('```json') + 7, prompt.lastIndexOf('```'));
    expect(JSON.parse(json).blocks).toHaveLength(state.version.blocks.length);
  });
});
