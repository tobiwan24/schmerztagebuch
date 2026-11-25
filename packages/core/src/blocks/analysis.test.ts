import { describe, it, expect } from 'vitest';
import { analyzeBlockValue, parseBlockConfig, type BlockType } from './index.js';
import type { AnalysisKind } from './analysis.js';
import { createIdGenerator } from '../ids.js';

const { newId } = createIdGenerator({ now: () => 1_700_000_000_000 });
const [o1, o2, p1, e1, a1] = [newId(), newId(), newId(), newId(), newId()];

/** Spec 05, Spalte „Datenart für Analyse" → erwartete Normalform-Art. */
const table: { type: BlockType; datenart: string; kind: AnalysisKind; config: unknown; value: unknown }[] = [
  { type: 'slider', datenart: 'numerisch', kind: 'numeric', config: { min: 0, max: 10, step: 1, unit: 'NRS' }, value: 7 },
  { type: 'checkbox', datenart: 'Ereignis', kind: 'event', config: { withNote: true }, value: { checked: true, note: 'x' } },
  {
    type: 'multiselect', datenart: 'Ereignis je Option', kind: 'options',
    config: { options: [{ id: o1, label: 'Ibu', color: '#f00' }, { id: o2, label: 'Para', color: '#00f' }], multiple: true },
    value: [o2],
  },
  { type: 'text', datenart: 'Text', kind: 'text', config: {}, value: 'Wetterumschwung' },
  {
    type: 'textarea', datenart: 'Text + Ereignisse', kind: 'textEvents',
    config: { allowAttachments: true, allowEvents: true },
    value: { text: 'Termin', events: [{ id: e1, category: 'doctor', title: 'Hausarzt' }], attachmentIds: [a1] },
  },
  { type: 'date', datenart: 'Zeit/Dauer', kind: 'time', config: { mode: 'duration' }, value: { minutes: 45 } },
  {
    type: 'bodymap', datenart: 'Regionen/Punkte', kind: 'points',
    config: { defaultPresetId: 'body-front' }, value: { presetId: 'body-front', points: [{ id: p1, x: 0.4, y: 0.2, intensity: 6 }] },
  },
];

describe('toAnalysis', () => {
  for (const row of table) {
    it(`BLK-02: ${row.type} liefert Datenart „${row.datenart}" (${row.kind})`, () => {
      const config = parseBlockConfig(row.type, row.config);
      const a = analyzeBlockValue(row.type, config, row.value);
      expect(a?.kind).toBe(row.kind);
    });
  }

  it('BLK-02: Normalformen enthalten die auswertbaren Größen', () => {
    const ms = parseBlockConfig('multiselect', table[2]!.config);
    expect(analyzeBlockValue('slider', parseBlockConfig('slider', table[0]!.config), 7)).toEqual({ kind: 'numeric', value: 7, unit: 'NRS' });
    expect(analyzeBlockValue('checkbox', { withNote: true }, { checked: true, note: 'x' })).toEqual({ kind: 'event', occurred: true });
    expect(analyzeBlockValue('multiselect', ms, [o2])).toEqual({ kind: 'options', optionIds: [o2] });
    expect(analyzeBlockValue('textarea', { allowAttachments: true, allowEvents: true }, table[4]!.value)).toEqual({
      kind: 'textEvents', text: 'Termin', events: [{ id: e1, category: 'doctor', title: 'Hausarzt' }], attachmentCount: 1,
    });
    expect(analyzeBlockValue('date', { mode: 'range' }, { start: '2026-01-01T08:00:00Z', end: '2026-01-01T09:30:00Z' })).toEqual({
      kind: 'time', start: '2026-01-01T08:00:00Z', end: '2026-01-01T09:30:00Z', durationMinutes: 90,
    });
    expect(analyzeBlockValue('date', { mode: 'datetime' }, { at: '2026-01-01T08:00:00Z' })).toEqual({ kind: 'time', at: '2026-01-01T08:00:00Z' });
    expect(analyzeBlockValue('bodymap', { defaultPresetId: 'body-front' }, table[6]!.value)).toEqual({
      kind: 'points', presetId: 'body-front', points: [{ x: 0.4, y: 0.2, intensity: 6 }],
    });
  });

  it('BLK-02: leere Werte liefern null (zählen nicht in n, Spec 06)', () => {
    expect(analyzeBlockValue('slider', parseBlockConfig('slider', { min: 0, step: 1 }), undefined)).toBeNull();
    expect(analyzeBlockValue('checkbox', { withNote: false }, { checked: false })).toBeNull();
    expect(analyzeBlockValue('multiselect', parseBlockConfig('multiselect', table[2]!.config), [])).toBeNull();
    expect(analyzeBlockValue('text', {}, '   ')).toBeNull();
    expect(analyzeBlockValue('bodymap', { defaultPresetId: 'x' }, { presetId: 'x', points: [] })).toBeNull();
  });
});
