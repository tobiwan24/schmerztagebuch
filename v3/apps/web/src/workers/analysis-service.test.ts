import { describe, expect, it } from 'vitest';
import { FIX, FIXTURE_NOW, fixtureDiaries, fixtureEntries, fixtureTemplates, fixtureVersions } from '@stb/analysis';
import { attachAnalysisService, createAnalysisClient } from './analysis-service';

describe('Analyse-Worker-Protokoll', () => {
  it('Anfragen über einen MessagePort: laden, filtern, suchen, aggregieren; Fehler kommen als Ablehnung an', async () => {
    const { port1, port2 } = new MessageChannel();
    attachAnalysisService(port2);
    const client = createAnalysisClient(port1);
    await expect(client.search('x')).rejects.toThrow('Arbeitsset noch nicht geladen');
    expect(await client.load({ entries: fixtureEntries, templates: fixtureTemplates, versions: fixtureVersions, diaries: fixtureDiaries })).toEqual({ entries: 9 });
    const spec = { diaryIds: [FIX.diary], range: { preset: 'all' as const }, conditions: [{ kind: 'number' as const, role: 'outcome' as const, op: '>=' as const, value: 7 }] };
    expect((await client.filter(spec, FIXTURE_NOW)).sort()).toEqual(['e01', 'e03', 'e07']);
    expect((await client.search('Ibuprofen')).sort()).toEqual(['e01', 'e03', 'e10']);
    const series = await client.dailySeries({ blockId: FIX.pain }, { now: FIXTURE_NOW });
    expect(series[0]).toEqual({ day: '2026-03-01', value: 7, n: 1 });
    const meds = await client.medicationDays({ now: FIXTURE_NOW });
    expect(meds.map((m) => [m.label, m.days])).toEqual([['Ibuprofen', 3], ['Paracetamol', 2]]);
    expect(await client.training({ now: FIXTURE_NOW })).toEqual({ weeks: [], totalDays: 0, levels: [] });
    // Zusammenhänge (ANA-26/27): Fixture hat weniger als 14 gemeinsame Tage bzw. 10 Fälle → keine Zahl
    const corr = await client.correlation({ blockId: FIX.pain }, { blockId: FIX.pain }, 0, { now: FIXTURE_NOW });
    expect(corr).toMatchObject({ enough: false, rho: null });
    const lifts = await client.triggers({ outcome: { blockId: FIX.back }, threshold: 5, lag: 0, trigger: { role: 'trigger' }, now: FIXTURE_NOW });
    expect(lifts.length).toBeGreaterThan(0);
    expect(lifts.every((l) => !l.enough && l.lift === null)).toBe(true);
    port1.close();
    port2.close();
  });
});
