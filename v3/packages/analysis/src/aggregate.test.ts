import { describe, expect, it } from 'vitest';
import { buildWorkingSet, type WsEntry } from './working-set.js';
import { applyFilter } from './filter.js';
import { bodymapOverview, comparePeriods, dailySeries, eventMarks, medicationDaysByMonth, optionDays, periodStats, previousRange } from './aggregate.js';
import { FIX, FIXTURE_NOW, fixtureDiaries, fixtureEntries, fixtureExtraEntries, fixtureTemplatesV2, fixtureVersionsV2 } from './fixture.js';

const ws = buildWorkingSet({ entries: [...fixtureEntries, ...fixtureExtraEntries], templates: fixtureTemplatesV2, versions: fixtureVersionsV2, diaries: fixtureDiaries });
const pain = { blockId: FIX.pain };

describe('Tagesaggregation', () => {
  it('ANA-05: Tage in der Tagebuch-Zeitzone (Europe/Berlin), unabhängig von der Geräte-Zeitzone', () => {
    const e13 = ws.byId.get('e13')!; // 22:30 UTC = 23:30 Berlin
    const e14 = ws.byId.get('e14')!; // 23:30 UTC am 13. = 00:30 Berlin am 14.
    expect(e13.day).toBe('2026-03-12');
    expect(e14.day).toBe('2026-03-14');
    expect(e14.occurredAt.slice(0, 10)).toBe('2026-03-13'); // in UTC wäre es der Vortag
    const days = dailySeries(ws.entries, pain).map((d) => d.day);
    expect(days).toContain('2026-03-12');
    expect(days).toContain('2026-03-14');
    expect(days).not.toContain('2026-03-13');
  });

  it('ANA-06: mean/max/last pro Tag korrekt; leere Werte zählen nicht; Tage ohne Eintrag erscheinen nicht als 0', () => {
    const at = (mode: 'mean' | 'max' | 'last') => dailySeries(ws.entries, pain, mode).find((d) => d.day === '2026-03-02')!;
    expect(at('max')).toEqual({ day: '2026-03-02', value: 3, n: 2 }); // e02 = 3, e09 = 2, e12 ohne Wert
    expect(at('mean')).toEqual({ day: '2026-03-02', value: 2.5, n: 2 });
    expect(at('last')).toEqual({ day: '2026-03-02', value: 2, n: 2 });
    // Standard für Rolle outcome ist max
    expect(dailySeries(ws.entries, pain).find((d) => d.day === '2026-03-02')!.value).toBe(3);
    expect(dailySeries(ws.entries, pain).map((d) => [d.day, d.value])).toEqual([
      ['2026-03-01', 7], ['2026-03-02', 3], ['2026-03-03', 9], ['2026-03-05', 5], ['2026-03-07', 1],
      ['2026-03-09', 4], ['2026-03-10', 6], ['2026-03-12', 4], ['2026-03-14', 2],
    ]);
    // Rolle über Vorlagen hinweg (Rücken-Werte an anderen Tagen kommen hinzu)
    expect(dailySeries(ws.entries, { role: 'outcome' }).find((d) => d.day === '2026-03-04')).toEqual({ day: '2026-03-04', value: 2, n: 1 });
  });

  it('ANA-07: Werte eines in Version 2 entfernten Blocks bleiben über die Block-ID auswertbar', () => {
    const e01 = ws.byId.get('e01')!;
    const nausea = e01.fields.find((f) => f.blockId === FIX.nausea)!;
    expect(nausea.archived).toBe(true);
    expect(nausea.label).toBe('Übelkeit');
    expect(ws.byId.get('e11')!.fields.some((f) => f.blockId === FIX.nausea)).toBe(false);
    expect(optionDays(ws.entries, { blockId: FIX.nausea }, { from: '2026-03-01', to: '2026-03-31' })).toEqual([
      { optionId: FIX.nausea, label: 'Übelkeit', days: 2, share: 2 / 11 }, // Tage mit Eintrag im März: 01.–07., 09., 10., 12., 14. = 11
    ]);
    const hits = applyFilter(ws, { diaryIds: [FIX.diary], range: { preset: 'all' }, conditions: [{ kind: 'checkbox', blockId: FIX.nausea, checked: true }] }, { now: FIXTURE_NOW });
    expect(hits.map((e) => e.id).sort()).toEqual(['e01', 'e03']);
  });
});

describe('Periodenvergleich', () => {
  it('ANA-08: liefert für die Fixture die vorab berechneten Kennzahlen', () => {
    const a = { from: '2026-03-01', to: '2026-03-05' };
    const b = { from: '2026-03-06', to: '2026-03-10' };
    const c = comparePeriods(ws.entries, pain, a, b, { threshold: 6 });
    expect(c.a).toEqual({ n: 4, mean: 6, median: 6, min: 3, max: 9, daysAtOrAbove: 2, daysWithEntry: 5, daysWithoutEntry: 0 });
    expect(c.b).toEqual({ n: 3, mean: 11 / 3, median: 4, min: 1, max: 6, daysAtOrAbove: 1, daysWithEntry: 4, daysWithoutEntry: 1 });
    expect(c.diff.mean).toBeCloseTo(11 / 3 - 6);
    expect(c.diff).toMatchObject({ median: -2, min: -2, max: -3, daysAtOrAbove: -1 });
    expect(previousRange(b)).toEqual(a);
    expect(periodStats(ws.entries, pain, { from: '2026-04-01', to: '2026-04-30' })).toMatchObject({ n: 0, mean: null, daysWithoutEntry: 30 });
  });

  it('ANA-09: „Wenige Daten" genau dann, wenn eine Seite n < 7 hat', () => {
    const mk = (day: string, v: number): WsEntry => ({
      id: day, diaryId: 'd', templateId: 't', templateName: 'T', occurredAt: `${day}T10:00:00.000Z`, day, tags: [], source: 'app', authorId: 'u',
      hasAttachment: false, weather: {}, fields: [{ blockId: 'p', type: 'slider', label: 'P', archived: false, value: { kind: 'numeric', value: v }, display: String(v), optionLabels: [] }],
    });
    const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => mk(`2026-01-${String(from + i).padStart(2, '0')}`, i));
    const a = { from: '2026-01-01', to: '2026-01-10' };
    const b = { from: '2026-01-11', to: '2026-01-20' };
    expect(comparePeriods([...days(1, 7), ...days(11, 7)], { blockId: 'p' }, a, b).fewData).toBe(false);
    expect(comparePeriods([...days(1, 6), ...days(11, 7)], { blockId: 'p' }, a, b).fewData).toBe(true);
    expect(comparePeriods([...days(1, 7), ...days(11, 6)], { blockId: 'p' }, a, b).fewData).toBe(true);
    expect(comparePeriods([...days(1, 10), ...days(11, 10)], { blockId: 'p' }, a, b).fewData).toBe(false);
  });
});

describe('Medikamententage', () => {
  it('ANA-10: je Monat und Option; mehrere Einnahmen am selben Tag zählen als ein Tag', () => {
    expect(medicationDaysByMonth(ws.entries)).toEqual([
      { month: '2026-02', optionId: FIX.ibu, label: 'Ibuprofen', days: 1 },
      { month: '2026-03', optionId: FIX.ibu, label: 'Ibuprofen', days: 3 },
      { month: '2026-03', optionId: FIX.para, label: 'Paracetamol', days: 2 },
    ]);
  });

  it('Häufigkeiten je Option mit Anteil an erfassten Tagen', () => {
    const r = optionDays(ws.entries, { role: 'trigger' }, { from: '2026-03-01', to: '2026-03-31' });
    expect(r.map((o) => [o.label, o.days])).toEqual([['Stress', 2], ['Wetter', 2]]);
  });
});

describe('Markierungen', () => {
  it('Ereignisse als Verlaufsmarkierungen, aufsteigend', () => {
    expect(eventMarks(ws.entries)).toEqual([
      { day: '2026-03-03', category: 'doctor', title: 'Hausarzt' },
      { day: '2026-03-06', category: 'event', title: 'Umzug' },
    ]);
  });
  it('Body-Map-Übersicht fasst Punkte je Bild zusammen', () => {
    const mk = (id: string, presetId: string, n: number): WsEntry => ({
      id, diaryId: 'd', templateId: 't', templateName: 'T', occurredAt: '2026-01-01T10:00:00.000Z', day: '2026-01-01', tags: [], source: 'app', authorId: 'u',
      hasAttachment: false, weather: {},
      fields: [{ blockId: 'bm', type: 'bodymap', label: 'B', archived: false, display: '', optionLabels: [], value: { kind: 'points', presetId, points: Array.from({ length: n }, (_, i) => ({ x: i / 10, y: 0.5 })) } }],
    });
    expect(bodymapOverview([mk('a', 'front', 2), mk('b', 'front', 1), mk('c', 'back', 3)]).map((o) => [o.presetId, o.entries, o.points.length])).toEqual([
      ['front', 2, 3], ['back', 1, 3],
    ]);
  });
});

