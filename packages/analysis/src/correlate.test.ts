import { describe, expect, it } from 'vitest';
import { bigFixture } from './big-fixture.js';
import { dailySeries, type DayValue } from './aggregate.js';
import { buildWorkingSet } from './working-set.js';
import { correlate, MIN_CORRELATION_DAYS, strengthOf } from './correlate.js';

const day = (i: number) => new Date(Date.UTC(2026, 2, 1 + i)).toISOString().slice(0, 10);
const series = (vals: number[], start = 0): DayValue[] => vals.map((value, i) => ({ day: day(start + i), value, n: 1 }));
const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('ANA-26: correlate (Spearman, Zeitversatz, Mindestzahl)', () => {
  it('ANA-26: gleichläufige Reihe ergibt ρ = 1, gegenläufige ρ = −1, mit n', () => {
    const a = series(seq(14));
    expect(correlate(a, series(seq(14).map((x) => x * 3 + 1))).rho).toBeCloseTo(1, 10);
    const r = correlate(a, series(seq(14).reverse()));
    expect(r).toMatchObject({ n: 14, enough: true, strength: 'strong', lag: 0 });
    expect(r.rho).toBeCloseTo(-1, 10);
  });

  it('ANA-26: von Hand gerechneter Wert mit Rangbindungen', () => {
    const a = seq(14);
    const b = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];
    // Mittelränge von b: 1,5 1,5 3,5 3,5 … 13,5 13,5; ρ = Pearson der Ränge
    const rb = [1.5, 1.5, 3.5, 3.5, 5.5, 5.5, 7.5, 7.5, 9.5, 9.5, 11.5, 11.5, 13.5, 13.5];
    const mean = 7.5;
    const cov = a.reduce((s, x, i) => s + (x - mean) * (rb[i]! - mean), 0);
    const va = a.reduce((s, x) => s + (x - mean) ** 2, 0);
    const vb = rb.reduce((s, x) => s + (x - mean) ** 2, 0);
    expect(correlate(series(a), series(b)).rho).toBeCloseTo(cov / Math.sqrt(va * vb), 10);
  });

  it('ANA-26: Zeitversatz paart a(d) mit b(d + lag)', () => {
    const av = [5, 1, 4, 2, 8, 3, 9, 7, 6, 10, 12, 11, 14, 13, 0, 15];
    const a = series(av);
    const b = series([99, ...av.slice(0, 15)]); // b(d+1) = a(d)
    const r1 = correlate(a, b, 1);
    expect(r1.rho).toBeCloseTo(1, 10);
    expect(r1.n).toBe(15);
    expect(correlate(a, b, 0).rho).not.toBeCloseTo(1, 3);
    expect(() => correlate(a, b, 8)).toThrow(RangeError);
    expect(() => correlate(a, b, 1.5)).toThrow(RangeError);
  });

  it('ANA-26: unter der Mindestzahl keine Zahl, Lücken zählen nicht als Paare', () => {
    expect(MIN_CORRELATION_DAYS).toBe(14);
    const r13 = correlate(series(seq(13)), series(seq(13)));
    expect(r13).toMatchObject({ n: 13, enough: false, rho: null, strength: null });
    const b = series(seq(14)).filter((d) => d.day !== day(5));
    expect(correlate(series(seq(14)), b)).toMatchObject({ n: 13, enough: false, rho: null });
  });

  it('ANA-26: konstante Reihe hat keinen Koeffizienten', () => {
    const r = correlate(series(seq(14)), series(Array(14).fill(4)));
    expect(r).toMatchObject({ n: 14, enough: true, rho: null, constant: true, strength: null });
  });

  it('ANA-26: Stärke in Worten (schwach < 0,3 ≤ mittel < 0,6 ≤ stark)', () => {
    expect(strengthOf(0.29)).toBe('weak');
    expect(strengthOf(-0.3)).toBe('medium');
    expect(strengthOf(0.59)).toBe('medium');
    expect(strengthOf(-0.6)).toBe('strong');
  });

  it('ANA-26: < 300 ms bei 5.000 Einträgen (alle Versätze)', () => {
    const big = bigFixture(5000);
    const ws = buildWorkingSet({ entries: big.entries, templates: big.templates, versions: big.versions, diaries: big.diaries });
    const t0 = performance.now();
    const pain = dailySeries(ws.entries, { blockId: 'a-pain' });
    const sleep = dailySeries(ws.entries, { blockId: 'a-sleep' });
    const rs = Array.from({ length: 8 }, (_, lag) => correlate(pain, sleep, lag));
    const ms = performance.now() - t0;
    expect(rs.every((r) => r.enough && r.rho !== null && Math.abs(r.rho) <= 1)).toBe(true);
    expect(ms).toBeLessThan(300);
  });
});
