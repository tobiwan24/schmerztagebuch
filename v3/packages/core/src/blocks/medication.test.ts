import { describe, it, expect } from 'vitest';
import { analyzeBlockValue, blockModules, parseBlockConfig, parseBlockValue } from './index.js';
import { createIdGenerator } from '../ids.js';

const { newId } = createIdGenerator({ now: () => 1_700_000_000_000 });
const p1 = newId();
const config = parseBlockConfig('medication', {
  presets: [{ id: p1, name: 'Ibuprofen', dose: 400, unit: 'mg', color: '#f00' }],
  allowFree: true,
});
const item = (extra: object = {}) => ({ id: newId(), name: 'Ibuprofen', ...extra });

describe('medication', () => {
  it('BLK-48: Konfiguration ergänzt Standard-Einheiten, Preset-IDs müssen eindeutig sein', () => {
    expect(config.units).toEqual(['mg', 'ml', 'Stk', 'Tropfen', 'Hub']);
    const dup = { presets: [config.presets[0], config.presets[0]], allowFree: true };
    expect(() => parseBlockConfig('medication', dup)).toThrow();
  });

  it('BLK-48: gültiger Wert mit Preset, Dosis, Uhrzeit und Wirkung', () => {
    const r = parseBlockValue('medication', config, {
      items: [item({ presetId: p1, dose: 400, unit: 'mg', at: '2026-03-01T08:00:00+01:00', effect: 6 })],
    });
    expect(r.success).toBe(true);
  });

  it('BLK-48: ungültige Dosis wird abgelehnt', () => {
    for (const dose of [0, -5, Number.NaN, Infinity]) {
      expect(parseBlockValue('medication', config, { items: [item({ dose })] }).success).toBe(false);
    }
    expect(parseBlockValue('medication', config, { items: [item({ effect: 11 })] }).success).toBe(false);
  });

  it('BLK-48: mehr als 20 Positionen werden abgelehnt, genau 20 sind erlaubt', () => {
    const mk = (n: number) => ({ items: Array.from({ length: n }, () => item()) });
    expect(parseBlockValue('medication', config, mk(20)).success).toBe(true);
    expect(parseBlockValue('medication', config, mk(21)).success).toBe(false);
  });

  it('BLK-48: unbekannte Preset-ID und freie Einträge ohne allowFree werden abgelehnt', () => {
    expect(parseBlockValue('medication', config, { items: [item({ presetId: newId() })] }).success).toBe(false);
    const strict = parseBlockConfig('medication', { presets: config.presets, allowFree: false });
    expect(parseBlockValue('medication', strict, { items: [item()] }).success).toBe(false);
    expect(parseBlockValue('medication', strict, { items: [item({ presetId: p1 })] }).success).toBe(true);
  });

  it('BLK-48: emptyValue, isEmpty, toDisplay, toAnalysis, toCsv', () => {
    const m = blockModules.medication;
    expect(m.emptyValue(config)).toEqual({ items: [] });
    expect(m.isEmpty({ items: [] })).toBe(true);
    expect(m.isEmpty(undefined)).toBe(true);
    const v = { items: [item({ dose: 400, unit: 'mg', at: '2026-03-01T08:00:00+01:00', effect: 5 }), item({ name: 'Novalgin' })] };
    expect(m.isEmpty(v)).toBe(false);
    expect(m.toDisplay(v, config)).toBe('Ibuprofen 400 mg, Novalgin');
    expect(m.toCsv?.(v, config)).toBe('Ibuprofen 400 mg 08:00; Novalgin');
    expect(analyzeBlockValue('medication', config, v)).toEqual({
      kind: 'medications',
      items: [
        { name: 'Ibuprofen', dose: 400, unit: 'mg', at: '2026-03-01T08:00:00+01:00', effect: 5 },
        { name: 'Novalgin' },
      ],
    });
    expect(analyzeBlockValue('medication', config, { items: [] })).toBeNull();
  });
});
