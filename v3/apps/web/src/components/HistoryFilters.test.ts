import { describe, expect, it } from 'vitest';
import { filterSpecSchema } from '@stb/analysis';
import { EMPTY_FILTER, activeFilterCount, fromSpec, isActive, toSpec, type FilterState } from './HistoryFilters';

const full: FilterState = {
  text: 'übelkeit', range: 'all', from: '2026-03-01', to: '2026-03-31', templateIds: ['t1', 't2'],
  outcome: true, meds: false, events: true, content: ['doctor', 'bodymap', 'image', 'pdf'], authorId: 'u-2',
};

describe('Verlauf-Filterzustand', () => {
  it('SHR-15: Autor-Filter wird zur Bedingung `meta/author`, bleibt über die Spec erhalten und macht den Filter aktiv', () => {
    const f = { ...EMPTY_FILTER, authorId: 'u-2' };
    const spec = toSpec(f, ['d1'], []);
    expect(filterSpecSchema.parse(spec).conditions).toEqual([{ kind: 'meta', field: 'author', value: 'u-2' }]);
    expect(fromSpec(spec)).toEqual(f);
    expect(isActive(f)).toBe(true);
  });

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

describe('RDM-028 P4: Zähler aktiver Filter', () => {
  it('RDM-028 P4: zählt je Vorlage, Zeitraum, Kennzeichen, Inhalt und Autor je 1; die Suche zählt nicht', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, text: 'abc' })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, range: '7d' })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_FILTER, from: '2026-03-01', to: '2026-03-31' })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_FILTER, templateIds: ['a', 'b'], outcome: true, meds: true, events: true, content: ['doctor', 'pdf'], authorId: 'u', range: '30d' })).toBe(9);
  });
});
