import { describe, expect, it } from 'vitest';
import { formatEntryTime } from './entry-format';

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
});
