import { describe, expect, it } from 'vitest';
import { formatDateTimeRange } from './date-picker';

describe('Zeitraum mit Uhrzeit (Anzeige im Auslöser)', () => {
  it('BLK-19: gleicher Tag zeigt das Datum einmal, verschiedene Tage beide Daten', () => {
    expect(formatDateTimeRange('2026-03-10T18:00', '2026-03-10T22:15')).toBe('10.03.2026, 18:00 – 22:15');
    expect(formatDateTimeRange('2026-03-02T18:00', '2026-03-04T08:00')).toBe('02.03.2026, 18:00 – 04.03.2026, 08:00');
  });
  it('BLK-19: unvollständiger Zeitraum ergibt leeren Text (Platzhalter)', () => {
    expect(formatDateTimeRange('', '')).toBe('');
    expect(formatDateTimeRange('2026-03-02T18:00', '')).toBe('');
  });
});
