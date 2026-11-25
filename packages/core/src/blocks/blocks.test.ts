import { describe, it, expect } from 'vitest';
import { blockModules, parseBlockConfig, parseBlockValue, type BlockType } from './index.js';
import { createIdGenerator } from '../ids.js';

const { newId } = createIdGenerator({ now: () => 1_700_000_000_000 });
const [o1, o2, p1, e1, a1] = [newId(), newId(), newId(), newId(), newId()];

interface Case {
  type: BlockType;
  config: unknown;
  validValues: unknown[];
  invalidValues: unknown[];
}

/** Gültige Konfiguration + gültige/ungültige Werte je Blocktyp. */
const cases: Case[] = [
  {
    type: 'slider', config: { min: 0, max: 10, step: 1, unit: 'NRS' },
    validValues: [0, 5, 10], invalidValues: [-1, 11, 2.5, '5', null, Number.NaN],
  },
  {
    type: 'checkbox', config: { withNote: true },
    validValues: [{ checked: true }, { checked: false, note: 'nach dem Essen' }],
    invalidValues: [true, { note: 'x' }, { checked: 'ja' }],
  },
  {
    type: 'multiselect',
    config: { options: [{ id: o1, label: 'Kopf', color: '#f00' }, { id: o2, label: 'Rücken', color: '#00f' }], multiple: true },
    validValues: [[], [o1], [o1, o2]], invalidValues: ['Kopf', ['Kopf'], [newId()], [o1, o1]],
  },
  {
    type: 'text', config: { maxLength: 5, placeholder: 'kurz' },
    validValues: ['', 'abc', 'abcde'], invalidValues: ['abcdef', 3, null],
  },
  {
    type: 'textarea', config: { allowAttachments: true, allowEvents: true },
    validValues: [
      {},
      { text: 'Notiz' },
      { events: [{ id: e1, category: 'doctor', title: 'Orthopäde', at: '2026-01-05T10:00:00+01:00' }] },
      { attachmentIds: [a1] },
    ],
    invalidValues: [
      'Notiz',
      { events: [{ id: e1, category: 'party', title: 'x' }] },
      { events: [{ id: e1, category: 'event', title: '' }] },
      { attachmentIds: ['kein-uuid'] },
    ],
  },
  {
    type: 'date', config: { mode: 'range' },
    validValues: [{ start: '2026-01-01T08:00:00Z', end: '2026-01-01T09:00:00Z' }],
    invalidValues: [
      { start: '2026-01-01T09:00:00Z', end: '2026-01-01T08:00:00Z' },
      { at: '2026-01-01T08:00:00Z' },
      { minutes: 5 },
    ],
  },
  {
    type: 'bodymap', config: { defaultPresetId: 'body-front' },
    validValues: [
      { presetId: 'body-front', points: [] },
      { presetId: 'body-back', points: [{ id: p1, x: 0, y: 1, intensity: 7 }] },
      // A-024: Punkt mit Größe/Kommentar, Pinselstrich mit Pfad
      { presetId: 'body-back', points: [{ id: p1, x: 0.5, y: 0.5, intensity: 3, kind: 'point', size: 0.05, comment: 'stechend' }] },
      { presetId: 'body-back', points: [{ id: p1, x: 0.1, y: 0.2, intensity: 9, kind: 'brush', size: 0.03, path: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }] },
    ],
    invalidValues: [
      { presetId: 'body-front', points: [{ id: p1, x: 1.2, y: 0.5 }] },
      { presetId: 'body-front', points: [{ id: p1, x: 0.1, y: 0.1, kind: 'brush' }] },
      { presetId: 'body-front', points: [{ id: p1, x: 0.1, y: 0.1, kind: 'point', path: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] },
      { presetId: 'body-front', points: [{ id: p1, x: 0.1, y: 0.1, size: 0 }] },
      { points: [] },
      { presetId: '', points: [] },
    ],
  },
  {
    type: 'medication', config: { presets: [], allowFree: true },
    validValues: [{ items: [] }, { items: [{ id: e1, name: 'Ibuprofen', dose: 400, unit: 'mg' }] }],
    invalidValues: [{}, { items: [{ id: e1, name: '', dose: 1 }] }, { items: [{ id: e1, name: 'X', dose: 0 }] }],
  },
  {
    type: 'exercise', config: {},
    validValues: [{ done: false }, { done: true, sets: 3, reps: 10, durationSec: 60, painDuring: 3 }],
    invalidValues: [{}, { done: true, painDuring: 11 }, { done: true, sets: -1 }, { done: true, levelId: e1 }],
  },
];

const invalidConfigs: [BlockType, unknown][] = [
  ['slider', { min: 10, max: 0, step: 1 }],
  ['slider', { min: 0, max: 10, step: 0 }],
  ['slider', { min: 0, max: 10, step: 3 }],
  ['checkbox', {}],
  ['multiselect', { options: [{ id: o1, label: 'A', color: '#000' }, { id: o1, label: 'B', color: '#000' }], multiple: true }],
  ['multiselect', { options: [{ id: o1, label: '', color: '#000' }], multiple: false }],
  ['text', { maxLength: 0 }],
  ['textarea', { allowAttachments: true }],
  ['date', { mode: 'week' }],
  ['bodymap', {}],
  ['medication', { presets: [] }],
  ['exercise', { videoUrl: 'http://example.org' }],
];

describe('Blockschemas', () => {
  it('BLK-01: jeder Blocktyp ist abgedeckt', () => {
    expect(cases.map((c) => c.type).sort()).toEqual(Object.keys(blockModules).sort());
  });

  for (const c of cases) {
    it(`BLK-01: ${c.type} — config und gültige Werte werden akzeptiert`, () => {
      const config = parseBlockConfig(c.type, c.config);
      for (const v of c.validValues) expect(parseBlockValue(c.type, config, v).success, JSON.stringify(v)).toBe(true);
    });
    it(`BLK-01: ${c.type} — ungültige Werte werden abgelehnt`, () => {
      const config = parseBlockConfig(c.type, c.config);
      for (const v of c.invalidValues) expect(parseBlockValue(c.type, config, v).success, JSON.stringify(v)).toBe(false);
    });
  }

  it('BLK-01: ungültige Konfigurationen werden abgelehnt', () => {
    for (const [type, cfg] of invalidConfigs) {
      expect(() => parseBlockConfig(type, cfg), `${type} ${JSON.stringify(cfg)}`).toThrow();
    }
  });

  it('BLK-01: date-Modi date/datetime/duration haben eigene Wertformen', () => {
    const d = parseBlockConfig('date', { mode: 'date' });
    expect(parseBlockValue('date', d, { at: '2026-03-01' }).success).toBe(true);
    expect(parseBlockValue('date', d, { at: '2026-03-01T10:00:00Z' }).success).toBe(false);
    const dt = parseBlockConfig('date', { mode: 'datetime' });
    expect(parseBlockValue('date', dt, { at: '2026-03-01T10:00:00+01:00' }).success).toBe(true);
    const du = parseBlockConfig('date', { mode: 'duration' });
    expect(parseBlockValue('date', du, { minutes: 90 }).success).toBe(true);
    expect(parseBlockValue('date', du, { minutes: -1 }).success).toBe(false);
  });

  it('BLK-01: textarea ohne allowEvents/allowAttachments lehnt Ereignisse/Anhänge ab', () => {
    const cfg = parseBlockConfig('textarea', { allowAttachments: false, allowEvents: false });
    expect(parseBlockValue('textarea', cfg, { text: 'x' }).success).toBe(true);
    expect(parseBlockValue('textarea', cfg, { attachmentIds: [a1] }).success).toBe(false);
    expect(parseBlockValue('textarea', cfg, { events: [] }).success).toBe(false);
  });

  it('BLK-01: multiselect mit multiple=false erlaubt höchstens eine Option', () => {
    const cfg = parseBlockConfig('multiselect', {
      options: [{ id: o1, label: 'A', color: '#000' }, { id: o2, label: 'B', color: '#111' }], multiple: false,
    });
    expect(parseBlockValue('multiselect', cfg, [o1]).success).toBe(true);
    expect(parseBlockValue('multiselect', cfg, [o1, o2]).success).toBe(false);
  });

  it('BLK-04: Slider hält min/max/step ein, Werte außerhalb werden abgelehnt', () => {
    const cfg = parseBlockConfig('slider', { min: 0, max: 100, step: 5 });
    for (const v of [0, 5, 50, 100]) expect(parseBlockValue('slider', cfg, v).success, String(v)).toBe(true);
    for (const v of [-5, 105, 3, 99.9]) expect(parseBlockValue('slider', cfg, v).success, String(v)).toBe(false);
    const fine = parseBlockConfig('slider', { min: 0, max: 1, step: 0.1 });
    expect(parseBlockValue('slider', fine, 0.3).success).toBe(true);
    expect(parseBlockValue('slider', fine, 0.35).success).toBe(false);
    const neg = parseBlockConfig('slider', { min: -5, max: 5, step: 2.5 });
    expect(parseBlockValue('slider', neg, -2.5).success).toBe(true);
    expect(parseBlockValue('slider', neg, -1).success).toBe(false);
  });

  it('BLK-04: Slider-Standard ist max 10, frei einstellbar', () => {
    expect(parseBlockConfig('slider', { min: 0, step: 1 })).toMatchObject({ max: 10 });
    expect(parseBlockConfig('slider', { min: 0, max: 250, step: 10 })).toMatchObject({ max: 250 });
  });

  it('DM-11: Multiselect-Werte sind Options-IDs; Umbenennen ändert historische Werte nicht', () => {
    const before = parseBlockConfig('multiselect', { options: [{ id: o1, label: 'Ibuprofen', color: '#f00' }], multiple: true });
    const stored = parseBlockValue('multiselect', before, [o1]);
    expect(stored.success && stored.data).toEqual([o1]);
    const after = parseBlockConfig('multiselect', { options: [{ id: o1, label: 'Ibuprofen 400', color: '#f00' }], multiple: true });
    const reread = parseBlockValue('multiselect', after, [o1]);
    expect(reread.success && reread.data).toEqual([o1]);
    expect(blockModules.multiselect.toDisplay([o1], after)).toBe('Ibuprofen 400');
    expect(parseBlockValue('multiselect', after, ['Ibuprofen']).success).toBe(false);
  });

  it('BLK-01: isEmpty/toDisplay je Typ', () => {
    expect(blockModules.slider.isEmpty(undefined)).toBe(true);
    expect(blockModules.slider.toDisplay(4, { min: 0, max: 10, step: 1, unit: 'NRS' })).toBe('4 NRS');
    expect(blockModules.checkbox.isEmpty({ checked: false })).toBe(true);
    expect(blockModules.multiselect.isEmpty([])).toBe(true);
    expect(blockModules.text.isEmpty('  ')).toBe(true);
    expect(blockModules.textarea.isEmpty({ text: '' })).toBe(true);
    expect(blockModules.textarea.isEmpty({ events: [{ id: e1, category: 'event', title: 'Sturz' }] })).toBe(false);
    expect(blockModules.date.toDisplay({ minutes: 90 }, { mode: 'duration' })).toBe('90 min');
    expect(blockModules.bodymap.isEmpty({ presetId: 'x', points: [] })).toBe(true);
  });
});
