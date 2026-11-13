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
    port1.close();
    port2.close();
  });
});
