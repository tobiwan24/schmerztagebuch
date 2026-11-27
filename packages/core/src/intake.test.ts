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
  it('VOI-08: enthält alle befüllbaren Blöcke der aktuellen Version mit Name, Bereich und Optionen (Zeilenformat, ohne IDs)', () => {
    const prompt = buildShortcutPrompt(state.template.name, state.version);
    const felder = prompt.split('\nFelder:\n')[1]!.split('\n\n')[0]!.split('\n');
    expect(felder).toHaveLength(state.version.blocks.filter((b) => b.type !== 'bodymap').length);
    for (const b of state.version.blocks.filter((x) => x.type !== 'bodymap')) {
      expect(felder.some((l) => l.startsWith(`${b.label}: `))).toBe(true);
      expect(prompt).not.toContain(b.id);
    }
    expect(prompt).toContain('Dauer (Stunden): Zahl 0 bis 72');
    for (const label of ['Übelkeit', 'Aura', 'Lichtempfindlichkeit', 'Lärmempfindlichkeit', 'Stress', 'Hormone']) expect(prompt).toContain(label);
  });
});

describe('Kurzbefehl: Medikamente', () => {
  const med = instantiateCatalogTemplate('pain-medication', { id: newId(), diaryId: newId(), order: 'V', newId }, clock);
  const block = med.version.blocks.find((b) => b.type === 'medication')!;
  const presetId = (name: string) => (block.type === 'medication' ? block.config.presets.find((p) => p.name === name)!.id : '');

  it('BLK-50: Namen werden auf Presets abgebildet (Dosis und Einheit aus dem Preset), Unbekanntes frei', () => {
    const r = mapIntakeToValues({ values: { medikamente: ['ibuprofen', 'Arnika'] } }, med.version);
    expect(r.errors).toEqual([]);
    const items = (r.values[block.id] as { items: { id: string; presetId?: string; name: string; dose?: number; unit?: string }[] }).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ presetId: presetId('Ibuprofen'), name: 'Ibuprofen', dose: 400, unit: 'mg' });
    expect(items[1]).toMatchObject({ name: 'Arnika' });
    expect(items[1]!.presetId).toBeUndefined();
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it('BLK-50: Objekte mit Dosis (Komma), Uhrzeit und Wirkung werden übernommen', () => {
    const r = mapIntakeToValues(
      { values: { [block.id]: [{ name: 'Paracetamol', dose: '1000', at: '2026-03-01T08:00:00+01:00', effect: 4 }] } },
      med.version,
    );
    expect(r.errors).toEqual([]);
    expect((r.values[block.id] as { items: unknown[] }).items[0]).toMatchObject({ name: 'Paracetamol', dose: 1000, unit: 'mg', effect: 4 });
  });

  it('BLK-50: ungültige Dosis und unbekannter Name ohne allowFree landen als Fehler (Eingang)', () => {
    const bad = mapIntakeToValues({ values: { Medikamente: { name: 'Ibuprofen', dose: 'viel' } } }, med.version);
    expect(bad.errors).toHaveLength(1);
    expect(bad.values[block.id]).toBeUndefined();
    const strict: typeof med.version = {
      ...med.version,
      blocks: med.version.blocks.map((b) => (b.type === 'medication' ? { ...b, config: { ...b.config, allowFree: false } } : b)),
    };
    const r = mapIntakeToValues({ values: { Medikamente: 'Arnika' } }, strict);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toContain('Arnika');
  });

  it('BLK-50: der Prompt beschreibt den Medikamenten-Block mit den Vorgaben', () => {
    const p = buildShortcutPrompt('Schmerztagebuch mit Medikamenten', med.version);
    expect(p).toMatch(/\nMedikamente: .*Ibuprofen/);
    // Zeilenformat: Namen per Komma/„und“, bekannte werden dem Preset zugeordnet
    const r = mapIntakeToValues({ lines: 'Medikamente: Ibuprofen und Arnika' }, med.version);
    expect(r.lineErrors).toEqual([]);
    expect((r.values[block.id] as { items: { name: string }[] }).items.map((i) => i.name)).toEqual(['Ibuprofen', 'Arnika']);
  });
});
