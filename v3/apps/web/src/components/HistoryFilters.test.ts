import { describe, expect, it } from 'vitest';
import { filterSpecSchema } from '@stb/analysis';
import { EMPTY_FILTER, fromSpec, isActive, toSpec, type FilterState } from './HistoryFilters';

const full: FilterState = {
  text: 'übelkeit', range: 'all', from: '2026-03-01', to: '2026-03-31', templateIds: ['t1', 't2'],
  outcome: true, meds: false, events: true, content: ['doctor', 'bodymap', 'image', 'pdf'],
};

describe('Verlauf-Filterzustand', () => {
  it('erzeugt eine gültige FilterSpec und stellt den Zustand daraus wieder her (gespeicherter Filter)', () => {
    const spec = toSpec(full, ['d1'], []);
    expect(filterSpecSchema.parse(spec)).toEqual(spec);
    expect(spec.range).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(spec.templateIds).toEqual(['t1', 't2']);
    expect(fromSpec(filterSpecSchema.parse(JSON.parse(JSON.stringify(spec))))).toEqual(full);
  });

  it('offener Zeitraum (nur „Von“ oder nur „Bis“) bleibt über die Spec erhalten', () => {
    const a = { ...EMPTY_FILTER, from: '2026-03-05' };
    expect(fromSpec(toSpec(a, ['d'], []))).toEqual(a);
    const b = { ...EMPTY_FILTER, to: '2026-03-05' };
    expect(fromSpec(toSpec(b, ['d'], []))).toEqual(b);
    expect(isActive(a)).toBe(true);
    expect(isActive(EMPTY_FILTER)).toBe(false);
  });

  it('vertauschter Zeitraum wird geordnet', () => {
    expect(toSpec({ ...EMPTY_FILTER, from: '2026-04-01', to: '2026-03-01' }, ['d'], []).range).toEqual({ from: '2026-03-01', to: '2026-04-01' });
  });
});
