// ANA-12: Leistungsbudgets (Spec 06) mit der 5.000-Einträge-Fixture (3 Vorlagen, 20 Blöcke). Gemessen wird der Median
// über mehrere Läufe nach einem Aufwärmlauf (JIT), damit einzelne Ausreißer der CI-Maschine nicht entscheiden.
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { applyFilter, bigFixture, buildWorkingSet, comparePeriods, createSearchIndex, dailySeries, type FilterSpec } from '@stb/analysis';

const BUDGET = { build: 1500, filter: 200, search: 100, compare: 300 };
const fx = bigFixture(5000);
const NOW = Date.parse(fx.entries.at(-1)!.occurredAt);

function median(fn: () => void, runs = 5): number {
  fn(); // Aufwärmen
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

describe('Leistungsbudgets (5.000 Einträge)', () => {
  it('ANA-12: Aufbau < 1,5 s, Filter < 200 ms, Volltextsuche < 100 ms, Periodenvergleich < 300 ms', () => {
    expect(fx.entries).toHaveLength(5000);
    expect(fx.versions.reduce((n, v) => n + v.blocks.length, 0)).toBe(20);

    let ws = buildWorkingSet(fx);
    let index = createSearchIndex(ws);
    const build = median(() => {
      ws = buildWorkingSet(fx);
      index = createSearchIndex(ws);
    }, 3);

    const spec: FilterSpec = {
      diaryIds: ['big-d'], range: { preset: '1y' }, tags: { mode: 'any', values: ['arbeit', 'urlaub'] },
      conditions: [{ kind: 'number', role: 'outcome', op: '>=', value: 5 }, { kind: 'option', role: 'medication', optionIds: ['a-meds-o1', 'b-meds-o1'], mode: 'any' }],
      anyOf: [[{ kind: 'checkbox', blockId: 'a-nausea', checked: true }], [{ kind: 'event' }], [{ kind: 'meta', field: 'source', value: 'quick' }]],
    };
    let hits = 0;
    const filter = median(() => {
      hits = applyFilter(ws, spec, { now: NOW }).length;
    });
    let found = 0;
    const search = median(() => {
      found = index.search('uebelkeit').size + index.search('Müdig').size + index.search('Hausarzt').size;
    });
    const last = fx.entries.at(-1)!.occurredAt.slice(0, 10);
    const compare = median(() => {
      comparePeriods(ws.entries, { role: 'outcome' }, { from: '2025-01-01', to: last }, { from: '2024-01-01', to: '2024-12-31' }, { threshold: 7 });
      dailySeries(ws.entries, { blockId: 'a-pain' });
    });

    // Plausibilität: die Messungen haben echte Arbeit getan
    expect(ws.entries).toHaveLength(5000);
    expect(hits).toBeGreaterThan(0);
    expect(found).toBeGreaterThan(0);
    console.log(`ANA-12: Aufbau ${build.toFixed(0)} ms, Filter ${filter.toFixed(1)} ms, Suche ${search.toFixed(1)} ms, Vergleich ${compare.toFixed(1)} ms`);
    expect(build).toBeLessThan(BUDGET.build);
    expect(filter).toBeLessThan(BUDGET.filter);
    expect(search).toBeLessThan(BUDGET.search);
    expect(compare).toBeLessThan(BUDGET.compare);
  }, 60_000);
});
