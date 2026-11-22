import { describe, expect, it } from 'vitest';
import { applyFilter, conditionSchema, filterSpecSchema, matchesCondition, normalizeText, sortEntries, type FilterSpec, type SortOrder } from './filter.js';
import { buildWorkingSet, type WsEntry } from './working-set.js';
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

describe('Verlaufsfilter und Sortierung', () => {
  const withAtt = buildWorkingSet({
    entries: fixtureEntries, templates: fixtureTemplates, versions: fixtureVersions, diaries: fixtureDiaries,
    attachments: [{ entryId: 'e01', kind: 'image' }, { entryId: 'e03', kind: 'pdf' }, { entryId: 'e03', kind: 'image' }, { entryId: 'e07', kind: 'image' }],
  });
  const ids = (spec: Partial<FilterSpec>) => applyFilter(withAtt, { ...base, ...spec } as FilterSpec, { now: FIXTURE_NOW }).map((e) => e.id).sort();

  it('ANA-19: attachment nach Art (image/pdf) aus attachmentMeta, ohne Art = irgendein Anhang, UND mit Ereignis-Kategorie', () => {
    expect(ids({ conditions: [{ kind: 'attachment', attachmentKind: 'image' }] })).toEqual(['e01', 'e03', 'e07']);
    expect(ids({ conditions: [{ kind: 'attachment', attachmentKind: 'pdf' }] })).toEqual(['e03']);
    expect(ids({ conditions: [{ kind: 'attachment' }] })).toEqual(['e01', 'e03', 'e07']);
    expect(ids({ conditions: [{ kind: 'attachment', attachmentKind: 'image' }, { kind: 'event', category: 'doctor' }] })).toEqual(['e03']);
    expect(ids({ conditions: [{ kind: 'event', category: 'event' }] })).toEqual(['e07']);
    expect(withAtt.byId.get('e03')?.attachmentKinds).toEqual(['image', 'pdf']);
    expect(run({ conditions: [{ kind: 'attachment', attachmentKind: 'image' }] })).toEqual([]); // ohne Metadaten
  });

  it('ANA-19: bodymap (nicht leer, optional Preset) trifft nur Einträge mit Punkten', () => {
    const mk = (id: string, points: number): WsEntry => ({
      id, diaryId: 'd', templateId: 't', templateName: 'T', occurredAt: '2026-03-01T10:00:00.000Z', day: '2026-03-01', tags: [], source: 'app', authorId: 'u',
      hasAttachment: false, attachmentKinds: [], weather: {},
      fields: [{ blockId: 'bm', type: 'bodymap', label: 'K', archived: false, value: { kind: 'points', presetId: 'p1', points: Array.from({ length: points }, () => ({ x: 0.5, y: 0.5 })) }, display: '', optionLabels: [] }],
    });
    expect(matchesCondition(mk('a', 2), { kind: 'bodymap' })).toBe(true);
    expect(matchesCondition(mk('b', 0), { kind: 'bodymap' })).toBe(false);
    expect(matchesCondition(mk('a', 2), { kind: 'bodymap', blockId: 'bm', region: 'p2' })).toBe(false);
  });

  it('ANA-19: bodymap ohne Ziel ist als FilterSpec gültig und läuft durch applyFilter', () => {
    expect(() => filterSpecSchema.parse({ ...base, conditions: [{ kind: 'bodymap' }] })).not.toThrow();
    expect(() => run({ conditions: [{ kind: 'bodymap' }] })).not.toThrow();
  });

  it('ANA-19: sortEntries newest, oldest, template_az, template_date — stabil, Eingabe unverändert', () => {
    const mk = (id: string, templateName: string, day: string): WsEntry => ({
      id, diaryId: 'd', templateId: templateName, templateName, occurredAt: `${day}T10:00:00.000Z`, day, tags: [], source: 'app', authorId: 'u',
      hasAttachment: false, attachmentKinds: [], weather: {}, fields: [],
    });
    const input = [mk('1', 'Rücken', '2026-03-02'), mk('2', 'Ärzte', '2026-03-01'), mk('3', 'Rücken', '2026-03-05'), mk('4', 'Kopf', '2026-03-05'), mk('5', 'Kopf', '2026-03-05')];
    const before = input.map((e) => e.id);
    const order = (o: SortOrder) => sortEntries(input, o).map((e) => e.id);
    expect(order('newest')).toEqual(['3', '4', '5', '1', '2']);
    expect(order('oldest')).toEqual(['2', '1', '3', '4', '5']);
    expect(order('template_az')).toEqual(['2', '4', '5', '1', '3']);
    expect(order('template_date')).toEqual(['2', '4', '5', '3', '1']);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});
