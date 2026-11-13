import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportCsvLong, exportCsvWide, formatCell, formatTime, CSV_LONG_COLUMNS, type CsvProfile } from './csv.js';
import { FIXTURE_EXPORT_NOW, exportFixture } from './fixture.js';

const golden = (name: string) => readFileSync(new URL(`../../../fixtures/export/${name}`, import.meta.url), 'utf8');

describe('CSV', () => {
  it('EXP-05: CSV long/wide entspricht für die Fixture den Golden Files (beide Profile)', () => {
    const src = exportFixture();
    for (const profile of ['standard', 'excel-de'] as CsvProfile[]) {
      expect(exportCsvLong(src, { profile, now: FIXTURE_EXPORT_NOW }), `long ${profile}`).toBe(golden(`csv-long-${profile}.csv`));
      expect(exportCsvWide(src, { profile, now: FIXTURE_EXPORT_NOW }), `wide ${profile}`).toBe(golden(`csv-wide-${profile}.csv`));
    }
    const long = golden('csv-long-standard.csv');
    expect(long.startsWith('﻿')).toBe(true); // UTF-8 mit BOM
    expect(long.slice(1, long.indexOf('\r\n')).split(',')).toEqual([...CSV_LONG_COLUMNS]);
    expect(golden('csv-long-excel-de.csv').split('\r\n')[0]!.includes(';')).toBe(true);
    // Multiselect: long = eine Zeile je Option, wide = Labels mit „; "
    expect(long.match(/,Begleitsymptome,symptom,multiselect,/g)).toHaveLength(2);
    expect(golden('csv-wide-standard.csv')).toContain(',Übelkeit; Lichtempfindlichkeit,');
  });

  it('EXP-06: CSV maskiert Trenner, Anführungszeichen, Zeilenumbrüche und verhindert Formel-Injection', () => {
    const t = (value: string, p: CsvProfile = 'standard') => formatCell({ kind: 'text', value }, p);
    expect(t('a,b')).toBe('"a,b"');
    expect(t('a;b')).toBe('a;b');
    expect(t('a;b', 'excel-de')).toBe('"a;b"');
    expect(t('sagt "hallo"')).toBe('"sagt ""hallo"""');
    expect(t('Zeile 1\nZeile 2')).toBe('"Zeile 1\nZeile 2"');
    expect(t('a\r\nb')).toBe('"a\r\nb"');
    for (const danger of ['=SUMME(A1)', '+49 123', '-1+1', '@cmd']) expect(t(danger)).toBe(`'${danger}`);
    expect(t('=1,2')).toBe(`"'=1,2"`); // erst Formel-Schutz, dann Maskierung
    expect(t('harmlos =1')).toBe('harmlos =1');
    // Zahlen sind keine Formeln: negatives Vorzeichen bleibt, Dezimalzeichen je Profil
    expect(formatCell({ kind: 'number', value: -2.5 }, 'standard')).toBe('-2.5');
    expect(formatCell({ kind: 'number', value: -2.5 }, 'excel-de')).toBe('-2,5');
    expect(formatCell({ kind: 'empty' }, 'standard')).toBe('');
  });

  it('Zeitformat je Profil: ISO bzw. TT.MM.JJJJ HH:MM in Tagebuch-Zeitzone', () => {
    expect(formatTime('2026-07-01T22:30:00.000Z', 'Europe/Berlin', 'standard')).toBe('2026-07-01T22:30:00.000Z');
    expect(formatTime('2026-07-01T22:30:00.000Z', 'Europe/Berlin', 'excel-de')).toBe('02.07.2026 00:30');
  });
});
