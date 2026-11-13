import { describe, expect, it } from 'vitest';
import { applyFilter, conditionSchema, filterSpecSchema, normalizeText, type FilterSpec } from './filter.js';
import { buildWorkingSet } from './working-set.js';
import { createSearchIndex } from './search.js';
import { FIX, FIXTURE_NOW, fixtureDiaries, fixtureEntries, fixtureTemplates, fixtureVersions } from './fixture.js';

const ws = buildWorkingSet({ entries: fixtureEntries, templates: fixtureTemplates, versions: fixtureVersions, diaries: fixtureDiaries });
const index = createSearchIndex(ws);
const base = { diaryIds: [FIX.diary], range: { preset: 'all' } } as const;
const run = (spec: Partial<FilterSpec>) =>
  applyFilter(ws, { ...base, ...spec } as FilterSpec, { now: FIXTURE_NOW, search: (t) => index.search(t) })
    .map((e) => e.id)
    .sort();

describe('FilterSpec', () => {
  it('ANA-01: Schema akzeptiert alle Bedingungsarten und lehnt unbekannte ab', () => {
    const all = [
      { kind: 'number', blockId: 'b', op: '>=', value: 5 },
      { kind: 'number', role: 'outcome', op: '<', value: 3 },
      { kind: 'number', weatherField: 'pressureHpa', op: '<', value: 1000 },
      { kind: 'option', blockId: 'b', optionIds: ['o'], mode: 'any' },
      { kind: 'option', role: 'medication', optionIds: ['o'], mode: 'none' },
      { kind: 'checkbox', blockId: 'b', checked: true },
      { kind: 'text', blockId: 'b', contains: 'x' },
      { kind: 'bodymap', blockId: 'b' },
      { kind: 'bodymap', blockId: 'b', region: 'default-koerper-vorderseite' },
      { kind: 'event' },
      { kind: 'event', category: 'doctor' },
      { kind: 'meta', field: 'source', value: 'quick' },
      { kind: 'meta', field: 'author', value: 'u1' },
      { kind: 'meta', field: 'hasAttachment', value: true },
    ];
    for (const c of all) expect(conditionSchema.safeParse(c).success, JSON.stringify(c)).toBe(true);
    const spec = { diaryIds: ['d'], templateIds: ['t'], range: { from: '2026-01-01', to: '2026-01-31' }, text: 'x', tags: { mode: 'all', values: ['a'] }, conditions: all, anyOf: [[all[0]]] };
    expect(filterSpecSchema.safeParse(spec).success).toBe(true);
    for (const preset of ['7d', '30d', '90d', '1y', 'all']) expect(filterSpecSchema.safeParse({ diaryIds: [], range: { preset } }).success).toBe(true);

    const bad = [
      { kind: 'regex', blockId: 'b', pattern: '.*' },
      { kind: 'number', blockId: 'b', op: '!=', value: 1 },
      { kind: 'number', op: '>', value: 1 }, // ohne Ziel
      { kind: 'number', blockId: 'b', role: 'outcome', op: '>', value: 1 }, // beide Ziele
      { kind: 'option', blockId: 'b', optionIds: [], mode: 'any' },
      { kind: 'number', weatherField: 'sonnenstunden', op: '>', value: 1 },
      { kind: 'meta', field: 'hasAttachment', value: 'ja' },
      { kind: 'checkbox', role: 'unbekannt', checked: true },
    ];
    for (const c of bad) expect(conditionSchema.safeParse(c).success, JSON.stringify(c)).toBe(false);
    expect(filterSpecSchema.safeParse({ diaryIds: [], range: { preset: '14d' } }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ diaryIds: [], range: { from: '2026-02-01', to: '2026-01-01' } }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ diaryIds: [], range: { preset: 'all' }, extra: 1 }).success).toBe(false);
  });
});

/** Erwartete IDs von Hand aus der Fixture abgeleitet (siehe fixture.ts). */
const CASES: [string, Partial<FilterSpec>, string[]][] = [
  ['alle', {}, ['e01', 'e02', 'e03', 'e04', 'e05', 'e06', 'e07', 'e08', 'e10']],
  ['Vorlage Kopfschmerz', { templateIds: [FIX.t1] }, ['e01', 'e02', 'e03', 'e04', 'e08', 'e10']],
  ['Schmerz ≥ 7', { conditions: [{ kind: 'number', blockId: FIX.pain, op: '>=', value: 7 }] }, ['e01', 'e03']],
  ['Rolle outcome ≥ 6', { conditions: [{ kind: 'number', role: 'outcome', op: '>=', value: 6 }] }, ['e01', 'e03', 'e05', 'e07', 'e10']],
  ['Rolle outcome < 3', { conditions: [{ kind: 'number', role: 'outcome', op: '<', value: 3 }] }, ['e06', 'e08']],
  ['Schmerz = 5', { conditions: [{ kind: 'number', blockId: FIX.pain, op: '=', value: 5 }] }, ['e04']],
  ['Ibuprofen (any)', { conditions: [{ kind: 'option', blockId: FIX.meds, optionIds: [FIX.ibu], mode: 'any' }] }, ['e01', 'e03', 'e10']],
  ['Ibuprofen + Paracetamol (all)', { conditions: [{ kind: 'option', blockId: FIX.meds, optionIds: [FIX.ibu, FIX.para], mode: 'all' }] }, ['e03']],
  ['kein Ibuprofen (none)', { conditions: [{ kind: 'option', blockId: FIX.meds, optionIds: [FIX.ibu], mode: 'none' }] }, ['e02', 'e04', 'e05', 'e06', 'e07', 'e08']],
  ['Übelkeit angehakt', { conditions: [{ kind: 'checkbox', blockId: FIX.nausea, checked: true }] }, ['e01', 'e03']],
  ['Übelkeit nicht angehakt', { conditions: [{ kind: 'checkbox', blockId: FIX.nausea, checked: false }] }, ['e02', 'e04', 'e05', 'e06', 'e07', 'e08', 'e10']],
  ['Notiz enthält „buero"', { conditions: [{ kind: 'text', blockId: FIX.notes2, contains: 'buero' }] }, ['e05']],
  ['Arzttermin', { conditions: [{ kind: 'event', category: 'doctor' }] }, ['e03']],
  ['beliebiges Ereignis', { conditions: [{ kind: 'event' }] }, ['e03', 'e07']],
  ['Quelle Schnelleintrag', { conditions: [{ kind: 'meta', field: 'source', value: 'quick' }] }, ['e03']],
  ['Autor u2', { conditions: [{ kind: 'meta', field: 'author', value: 'u2' }] }, ['e08']],
  ['Tag arbeit (any)', { tags: { mode: 'any', values: ['arbeit'] } }, ['e01', 'e03']],
  ['Tags arbeit + wochenende (all)', { tags: { mode: 'all', values: ['arbeit', 'wochenende'] } }, ['e03']],
  ['Zeitraum 04.–06.03.', { range: { from: '2026-03-04', to: '2026-03-06' } }, ['e04', 'e06', 'e07']],
  ['letzte 7 Tage', { range: { preset: '7d' } }, ['e04', 'e06', 'e07', 'e08', 'e10']],
  ['ODER-Gruppen', { anyOf: [[{ kind: 'number', blockId: FIX.pain, op: '>=', value: 9 }], [{ kind: 'number', blockId: FIX.back, op: '>=', value: 8 }]] }, ['e03', 'e07']],
  ['Rücken + Schlaf ≤ 4', { templateIds: [FIX.t2], conditions: [{ kind: 'number', blockId: FIX.sleep, op: '<=', value: 4 }] }, ['e05', 'e07']],
  ['Volltext + Bedingung', { text: 'Ibuprofen', conditions: [{ kind: 'number', role: 'outcome', op: '>=', value: 7 }] }, ['e01', 'e03']],
  ['anderes Tagebuch', { diaryIds: ['d-2'] }, []],
];

describe('Filter-Engine', () => {
  it.each(CASES)('ANA-02: %s', (_name, spec, expected) => {
    expect(run(spec)).toEqual(expected);
  });

  it('ANA-02: mindestens 20 tabellarisch definierte Filter', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it('ANA-03: Rollenbedingung (outcome) trifft Blöcke verschiedener Vorlagen', () => {
    const hits = applyFilter(ws, { ...base, conditions: [{ kind: 'number', role: 'outcome', op: '>=', value: 6 }] }, { now: FIXTURE_NOW });
    expect(new Set(hits.map((e) => e.templateId))).toEqual(new Set([FIX.t1, FIX.t2]));
    const trig = applyFilter(ws, { ...base, conditions: [{ kind: 'option', role: 'trigger', optionIds: [FIX.stress], mode: 'any' }] }, { now: FIXTURE_NOW });
    expect(trig.map((e) => e.id).sort()).toEqual(['e05', 'e07']);
  });

  it('Volltextfilter ohne Suchindex wird abgelehnt', () => {
    expect(() => applyFilter(ws, { ...base, text: 'x' }, { now: FIXTURE_NOW })).toThrow();
  });
});

describe('Volltextsuche', () => {
  it('ANA-04: findet „Übelkeit" mit „uebelkeit", „Ubelk" und „übelkeit"; findet Options-Labels und Ereignistitel', () => {
    for (const q of ['uebelkeit', 'Ubelk', 'übelkeit', 'ÜBELKEIT']) expect(index.search(q).has('e01'), q).toBe(true);
    expect([...index.search('Ibuprofen')].sort()).toEqual(['e01', 'e03', 'e10']);
    expect([...index.search('Hausarzt')]).toEqual(['e03']);
    expect([...index.search('Umzug')]).toEqual(['e07']);
    expect(index.search('wochenende').has('e04')).toBe(true); // Tags
    expect(index.search('Schlafqualität').has('e06')).toBe(true); // Blocknamen
    expect(index.search('xyzzy').size).toBe(0);
  });

  it('Normalform: ä≙ae, ß≙ss, Groß/klein egal', () => {
    expect(normalizeText('Übelkeit Größe STRAẞE')).toBe('uebelkeit groesse strasse');
  });
});
