import { describe, expect, it } from 'vitest';
import type { BlockDef, Entry, Template, TemplateVersion } from '@stb/core';
import { buildWorkingSet } from './working-set.js';
import { MIN_LIFT_CASES, triggerLift } from './lift.js';

// Fixture (von Hand nachrechenbar): 20 Tage ab 01.03.2026, Tagebuch Europe/Berlin.
// Stress an Tag 1–10; Wetter an Tag 3, 4, 5. Schmerz ≥ 7 an Tag 1–6 und 11–12, sonst 2.
const D = 'd-1';
const T = 't-1';
const at = '2026-03-01T00:00:00.000Z';
const slider: BlockDef = { id: 'b-pain', type: 'slider', label: 'Schmerz', required: false, order: 'a', role: 'outcome', config: { min: 0, max: 10, step: 1 } };
const trig: BlockDef = {
  id: 'b-trig', type: 'multiselect', label: 'Auslöser', required: false, order: 'b', role: 'trigger',
  config: { multiple: true, options: [{ id: 'o-stress', label: 'Stress', color: '#888888' }, { id: 'o-wetter', label: 'Wetter', color: '#888888' }] },
};
const templates: Template[] = [{ id: T, diaryId: D, name: 'T', order: 'a', currentVersion: 1, archived: false, createdAt: at, updatedAt: at }];
const versions: TemplateVersion[] = [{ templateId: T, version: 1, createdAt: at, blocks: [slider, trig] }];
const day = (i: number) => new Date(Date.UTC(2026, 2, i)).toISOString().slice(0, 10);

const rows: Entry[] = Array.from({ length: 20 }, (_, k) => {
  const i = k + 1;
  const ts = `${day(i)}T10:00:00.000Z`;
  const high = i <= 6 || i === 11 || i === 12;
  const opts = [...(i <= 10 ? ['o-stress'] : []), ...(i >= 3 && i <= 5 ? ['o-wetter'] : [])];
  return {
    id: `e${i}`, diaryId: D, templateId: T, templateVersion: 1, occurredAt: ts, recordedAt: ts, updatedAt: ts, authorId: 'u', tags: [],
    values: { 'b-pain': high ? 8 : 2, ...(opts.length ? { 'b-trig': opts } : {}) }, meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `${i}:0000:x`,
  };
});
const ws = buildWorkingSet({ entries: rows, templates, versions, diaries: [{ id: D, settings: { timezone: 'Europe/Berlin' } }] });
const base = { outcome: { blockId: 'b-pain' }, threshold: 7, trigger: { role: 'trigger' as const } };

describe('ANA-27: triggerLift (Vierfeldertafel, Lift, Mindestzahl)', () => {
  it('ANA-27: Vierfeldertafel und Lift am selben Tag', () => {
    expect(MIN_LIFT_CASES).toBe(10);
    const stress = triggerLift(ws.entries, base).find((r) => r.key === 'o-stress')!;
    expect(stress.table).toEqual({ exposedHigh: 6, exposedLow: 4, otherHigh: 2, otherLow: 8 });
    expect(stress).toMatchObject({ cases: 10, enough: true, rateWithEvent: 0.6, rateOverall: 0.4, label: 'Stress' });
    expect(stress.lift).toBeCloseTo(1.5, 10);
  });

  it('ANA-27: Ereignis am Vortag (lag 1)', () => {
    const stress = triggerLift(ws.entries, { ...base, lag: 1 }).find((r) => r.key === 'o-stress')!;
    // Ergebnistage 2–11 haben Stress am Vortag; hoch: Tag 2–6 und 11
    expect(stress.table).toEqual({ exposedHigh: 6, exposedLow: 4, otherHigh: 2, otherLow: 8 });
    expect(stress.cases).toBe(10);
  });

  it('ANA-27: unter der Mindestzahl Fälle keine Zahl, aber die Fallzahl', () => {
    const wetter = triggerLift(ws.entries, base).find((r) => r.key === 'o-wetter')!;
    expect(wetter).toMatchObject({ cases: 3, enough: false, lift: null, rateWithEvent: null, rateOverall: null });
    expect(wetter.table.exposedHigh).toBe(3);
  });

  it('ANA-27: Sortierung — Lift absteigend, Ereignisse ohne Zahl am Ende', () => {
    expect(triggerLift(ws.entries, base).map((r) => r.key)).toEqual(['o-stress', 'o-wetter']);
  });

  it('ANA-27: Zeitraum begrenzt die Ergebnistage; kein Ereignis ergibt keine Zeilen', () => {
    const none = triggerLift(ws.entries, { ...base, range: { from: day(15), to: day(20) } });
    expect(none).toEqual([]);
    const part = triggerLift(ws.entries, { ...base, range: { from: day(1), to: day(10) } }).find((r) => r.key === 'o-stress')!;
    expect(part.cases).toBe(10);
    expect(part.table.otherHigh + part.table.otherLow).toBe(0);
  });

  it('ANA-27: Gesamtanteil 0 ergibt keinen Lift (keine Division durch 0)', () => {
    const r = triggerLift(ws.entries, { ...base, threshold: 99 }).find((x) => x.key === 'o-stress')!;
    expect(r).toMatchObject({ enough: true, rateOverall: 0, lift: null });
  });
});
