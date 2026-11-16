import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { keyBetween } from './fractional-index.js';
import { createTemplate, updateTemplate, type BlockDef, type Entry } from './templates.js';
import { resolveEntryView } from './entry-view.js';
import { displayValue } from './entry-form.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const { newId } = createIdGenerator(clock);

function fixture() {
  const k1 = keyBetween(null, null);
  const k2 = keyBetween(k1, null);
  const k3 = keyBetween(k2, null);
  const pain: BlockDef = { id: newId(), type: 'slider', label: 'Schmerz', required: true, order: k1, config: { min: 0, max: 10, step: 1 } };
  const sleep: BlockDef = { id: newId(), type: 'slider', label: 'Schlaf', required: false, order: k2, config: { min: 0, max: 10, step: 1 } };
  const note: BlockDef = { id: newId(), type: 'text', label: 'Notiz', required: false, order: k3, config: {} };
  const v1 = createTemplate({ id: newId(), diaryId: newId(), name: 'T', order: k1, blocks: [pain, sleep, note] }, clock);
  const entry = {
    id: newId(), templateId: v1.template.id, templateVersion: 1, values: { [pain.id]: 6, [sleep.id]: 3, [note.id]: 'x' },
  } as Pick<Entry, 'id' | 'templateId' | 'templateVersion' | 'values'>;
  return { pain, sleep, note, v1, entry };
}

describe('Eintragsansicht über Vorlagenversionen', () => {
  it('DM-08: entfernter Block erscheint als archiviertes Feld, alle Werte bleiben sichtbar', () => {
    const { pain, sleep, note, v1, entry } = fixture();
    const v2 = updateTemplate(v1, { blocks: [pain, note] }, clock).state.version;
    const view = resolveEntryView(entry, v1.version, v2);
    expect(view.map((f) => [f.block.label, f.value, f.archived])).toEqual([
      ['Schmerz', 6, false],
      ['Notiz', 'x', false],
      ['Schlaf', 3, true],
    ]);
    expect(view.find((f) => f.block.id === sleep.id)?.archived).toBe(true);
  });

  it('DM-08: umbenannter Block zeigt das aktuelle Label; neue Blöcke erscheinen leer', () => {
    const { pain, sleep, note, v1, entry } = fixture();
    const extra: BlockDef = { id: newId(), type: 'checkbox', label: 'Medikament', required: false, order: keyBetween(note.order, null), config: { withNote: false } };
    const v2 = updateTemplate(v1, { blocks: [{ ...pain, label: 'Schmerzstärke' }, sleep, note, extra] }, clock).state.version;
    const view = resolveEntryView(entry, v1.version, v2);
    expect(view.map((f) => [f.block.label, f.value, f.archived])).toEqual([
      ['Schmerzstärke', 6, false],
      ['Schlaf', 3, false],
      ['Notiz', 'x', false],
      ['Medikament', undefined, false],
    ]);
  });

  it('DM-08: archivierte Blöcke ohne Wert werden nicht angezeigt', () => {
    const { pain, note, v1, entry } = fixture();
    const v2 = updateTemplate(v1, { blocks: [pain, note] }, clock).state.version;
    const { [Object.keys(entry.values)[1]!]: _, ...rest } = entry.values;
    void _;
    const view = resolveEntryView({ ...entry, values: rest }, v1.version, v2);
    expect(view.every((f) => !f.archived)).toBe(true);
  });

  it('BLK-06: umsortierte Blöcke erscheinen in der Reihenfolge der aktuellen Version', () => {
    const { pain, sleep, note, v1, entry } = fixture();
    const r = updateTemplate(v1, { blocks: [{ ...note, order: keyBetween(null, pain.order) }, pain, sleep] }, clock);
    expect(r.newVersion).toBe(true);
    const view = resolveEntryView(entry, v1.version, r.state.version);
    expect(view.map((f) => f.block.label)).toEqual(['Notiz', 'Schmerz', 'Schlaf']);
    expect(view.map((f) => f.value)).toEqual(['x', 6, 3]);
  });

  it('DM-08: Version passt nicht zum Eintrag → Fehler', () => {
    const { v1, entry } = fixture();
    expect(() => resolveEntryView({ ...entry, templateVersion: 2 }, v1.version, v1.version)).toThrow();
  });
});

describe('Optionslabels über die Eintragsversion', () => {
  it('BLK-26: umbenannte/entfernte Option zeigt das Label der Eintragsversion, nie die Options-ID', () => {
    const opt = (label: string) => ({ id: newId(), label, color: 'blue' });
    const [a, b] = [opt('Übelkeit'), opt('Aura')];
    const ms: BlockDef = { id: newId(), type: 'multiselect', label: 'Symptome', required: false, order: keyBetween(null, null), config: { options: [a, b], multiple: true } };
    const t1 = createTemplate({ id: newId(), diaryId: newId(), name: 'M', order: keyBetween(null, null), blocks: [ms] }, clock);
    const entry = { templateId: t1.template.id, templateVersion: 1, values: { [ms.id]: [a.id, b.id] } };
    const renamed: BlockDef = { ...ms, label: 'Beschwerden', config: { options: [{ ...a, label: 'Brechreiz' }], multiple: true } };
    const t2 = updateTemplate(t1, { blocks: [renamed] }, clock).state.version;
    const [field] = resolveEntryView(entry, t1.version, t2);
    expect(displayValue(field!.block, field!.value)).toBe('Übelkeit, Aura');
    expect(field!.block.label).toBe('Beschwerden');
  });
});
