import { describe, expect, it } from 'vitest';
import { entryDay, formatDay, formatEntryTime, groupByDay } from './entry-format';

const local = (s: string) => new Date(s).toISOString();

describe('Zeitangabe in Verlauf und Detail', () => {
  it('Zeitpunkt, ganztägiger Zeitraum und Zeitraum mit Uhrzeiten', () => {
    expect(formatEntryTime({ occurredAt: local('2026-02-20T21:30') })).toBe('20.02.2026, 21:30');
    expect(formatEntryTime({ occurredAt: local('2026-03-02T00:00'), period: { start: '2026-03-02', end: '2026-03-04' } })).toBe('02.03.2026 – 04.03.2026');
    expect(formatEntryTime({ occurredAt: local('2026-03-02T00:00'), period: { start: '2026-03-02', end: '2026-03-02' } })).toBe('02.03.2026 (ganztägig)');
    const p = { start: local('2026-03-02T08:00'), end: local('2026-03-02T18:30') };
    expect(formatEntryTime({ occurredAt: p.start, period: p })).toBe('02.03.2026, 08:00 – 18:30');
    const q = { start: local('2026-03-02T08:00'), end: local('2026-03-03T09:00') };
    expect(formatEntryTime({ occurredAt: q.start, period: q })).toBe('02.03.2026, 08:00 – 03.03.2026, 09:00');
  });

  it('gruppiert nach lokalem Tag; Zeitraum unter dem Beginn; Heute/Gestern', () => {
    const a = { occurredAt: local('2026-03-05T08:00') };
    const b = { occurredAt: local('2026-03-05T07:00') };
    const c = { occurredAt: local('2026-03-02T00:00'), period: { start: '2026-03-02', end: '2026-03-04' } };
    expect(groupByDay([a, b, c]).map((g) => [g.day, g.entries.length])).toEqual([['2026-03-05', 2], ['2026-03-02', 1]]);
    expect(entryDay(c)).toBe('2026-03-02');
    const now = new Date('2026-03-05T12:00').getTime();
    expect(formatDay('2026-03-05', now)).toBe('Heute');
    expect(formatDay('2026-03-04', now)).toBe('Gestern');
    expect(formatDay('2026-03-02', now)).toMatch(/2\. März 2026/);
  });
});
