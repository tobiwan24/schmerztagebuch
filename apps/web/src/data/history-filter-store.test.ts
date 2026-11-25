import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER } from '@/components/HistoryFilters';
import { readHistoryFilter, writeHistoryFilter } from './history-filter-store';

describe('RDM-030: Verlauf-Filter im Speicher', () => {
  it('RDM-030: startet leer und hält den zuletzt gesetzten Filter bis zum Neustart (Modulzustand, kein Storage)', () => {
    expect(readHistoryFilter()).toEqual(EMPTY_FILTER);
    const f = { ...EMPTY_FILTER, range: '7d' as const, outcome: true };
    writeHistoryFilter(f);
    expect(readHistoryFilter()).toEqual(f);
    expect(typeof localStorage === 'undefined' || localStorage.length === 0).toBe(true);
  });
});
