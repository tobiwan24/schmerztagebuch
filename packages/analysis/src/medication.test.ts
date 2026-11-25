import { describe, expect, it } from 'vitest';
import { buildWorkingSet, medicationKey } from './working-set.js';
import { applyFilter } from './filter.js';
import { createSearchIndex } from './search.js';
import { medicationDaysByMonth, optionDays } from './aggregate.js';
import { FIX, FIXMED, FIXTURE_NOW, fixtureDiaries, fixtureMedEntries, fixtureMedTemplates, fixtureMedVersions } from './fixture.js';

const ws = buildWorkingSet({ entries: fixtureMedEntries, templates: fixtureMedTemplates, versions: fixtureMedVersions, diaries: fixtureDiaries });
const index = createSearchIndex(ws);
const run = (conditions: unknown[], text?: string) =>
  applyFilter(
    ws,
    { diaryIds: [FIX.diary], range: { preset: 'all' }, conditions, ...(text ? { text } : {}) } as never,
    { now: FIXTURE_NOW, search: (t) => index.search(t) },
  )
    .map((e) => e.id)
    .sort();

describe('Medikamenten-Block in der Analyse', () => {
  it('ANA-22: Arbeitsset enthält die Positionen als Normalform „medications" mit Anzeige und Namen', () => {
    const f = ws.byId.get('m1')!.fields.find((x) => x.blockId === FIXMED.meds)!;
    expect(f.value.kind).toBe('medications');
    expect(f.display).toBe('Ibuprofen 400 mg, Paracetamol 500 mg');
    expect(f.optionLabels).toEqual(['Ibuprofen', 'Paracetamol']);
    expect(ws.byId.get('m5')!.fields.some((x) => x.blockId === FIXMED.meds)).toBe(false);
  });

  it('ANA-22: Filter „Medikamentenname" über Name (Groß/Klein egal) oder Vorgaben-ID, auch über die Rolle', () => {
    expect(medicationKey(' IBUPROFEN ')).toBe('ibuprofen');
    expect(run([{ kind: 'option', role: 'medication', optionIds: ['Ibuprofen'], mode: 'any' }])).toEqual(['m1', 'm2', 'm3']);
    expect(run([{ kind: 'option', blockId: FIXMED.meds, optionIds: [FIXMED.pIbu], mode: 'any' }])).toEqual(['m1', 'm2']);
    expect(run([{ kind: 'option', role: 'medication', optionIds: ['ibuprofen', 'paracetamol'], mode: 'all' }])).toEqual(['m1']);
    expect(run([{ kind: 'option', role: 'medication', optionIds: ['ibuprofen'], mode: 'none' }])).toEqual(['m4', 'm5']);
  });

  it('ANA-22: Suche findet Medikamentennamen (auch freie)', () => {
    expect(run([], 'novalgin')).toEqual(['m4']);
    expect(run([], 'paracetamol')).toEqual(['m1']);
  });

  it('ANA-22: Medikamententage je Monat zählen je Name, mehrere Einträge am Tag = ein Tag, Schreibweise der Vorgabe', () => {
    expect(medicationDaysByMonth(ws.entries)).toEqual([
      { month: '2026-03', optionId: 'ibuprofen', label: 'Ibuprofen', days: 2 },
      { month: '2026-03', optionId: 'paracetamol', label: 'Paracetamol', days: 1 },
      { month: '2026-04', optionId: 'novalgin', label: 'Novalgin', days: 1 },
    ]);
  });

  it('ANA-22: Häufigkeiten (Tage und Anteil der erfassten Tage) je Name', () => {
    // März: erfasste Tage 01., 03., 05. → Ibuprofen 2 von 3, Paracetamol 1 von 3
    const r = optionDays(ws.entries, { role: 'medication' }, { from: '2026-03-01', to: '2026-03-31' });
    expect(r.map((x) => [x.label, x.days])).toEqual([['Ibuprofen', 2], ['Paracetamol', 1]]);
    expect(r[0]!.share).toBeCloseTo(2 / 3);
    expect(r[1]!.share).toBeCloseTo(1 / 3);
  });
});
