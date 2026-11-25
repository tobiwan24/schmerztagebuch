import { describe, it, expect } from 'vitest';
import { keyBetween, compareByOrder, isValidOrderKey } from './fractional-index.js';

/** Deterministischer PRNG (mulberry32) — nur in Tests. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Fractional Index', () => {
  it('DM-04: erzeugt Keys am Anfang, am Ende und dazwischen', () => {
    const first = keyBetween(null, null);
    const after = keyBetween(first, null);
    const before = keyBetween(null, first);
    const mid = keyBetween(first, after);
    expect(before < first && first < mid && mid < after).toBe(true);
    for (const k of [first, after, before, mid]) expect(isValidOrderKey(k)).toBe(true);
  });

  it('DM-04: zwischen zwei beliebigen (auch benachbarten) Keys lässt sich immer ein Key erzeugen', () => {
    const rnd = prng(42);
    const keys = [keyBetween(null, null)];
    for (let i = 0; i < 300; i++) {
      const sorted = [...keys].sort();
      const j = Math.floor(rnd() * (sorted.length + 1));
      keys.push(keyBetween(sorted[j - 1] ?? null, sorted[j] ?? null));
    }
    const sorted = [...new Set(keys)].sort();
    expect(sorted).toHaveLength(keys.length);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      const k = keyBetween(a, b);
      expect(a < k && k < b, `${a} < ${k} < ${b}`).toBe(true);
    }
    // Extremfälle nahe der Untergrenze
    expect(keyBetween(null, '01') < '01').toBe(true);
    expect(keyBetween('0V', '0W') > '0V').toBe(true);
  });

  it('DM-04: 1.000 zufällige Einfügungen ergeben eine korrekt sortierte Liste', () => {
    const rnd = prng(7);
    const list: { id: string; order: string }[] = [];
    for (let i = 0; i < 1000; i++) {
      const pos = Math.floor(rnd() * (list.length + 1));
      const order = keyBetween(list[pos - 1]?.order ?? null, list[pos]?.order ?? null);
      list.splice(pos, 0, { id: `id-${i}`, order });
    }
    const resorted = [...list].sort(compareByOrder);
    expect(resorted.map((x) => x.id)).toEqual(list.map((x) => x.id));
    expect(Math.max(...list.map((x) => x.order.length))).toBeLessThan(40);
  });

  it('DM-04: lehnt ungültige oder falsch geordnete Grenzen ab', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
    expect(() => keyBetween('a0', null)).toThrow();
    expect(() => keyBetween('a-b', null)).toThrow();
    expect(() => keyBetween('', null)).toThrow();
  });

  it('DM-05: gleiche Order-Strings werden deterministisch über die ID sortiert', () => {
    const items = [
      { id: '0190-c', order: 'V' },
      { id: '0190-a', order: 'V' },
      { id: '0190-b', order: 'V' },
      { id: '0190-z', order: 'K' },
    ];
    const expected = ['0190-z', '0190-a', '0190-b', '0190-c'];
    expect([...items].sort(compareByOrder).map((x) => x.id)).toEqual(expected);
    expect([...items].reverse().sort(compareByOrder).map((x) => x.id)).toEqual(expected);
  });

  it('DM-05: Vergleich nutzt Code-Unit-Reihenfolge, nicht die Locale', () => {
    expect(compareByOrder({ id: 'x', order: 'Z' }, { id: 'x', order: 'a' })).toBeLessThan(0);
    expect(compareByOrder({ id: 'B', order: 'V' }, { id: 'a', order: 'V' })).toBeLessThan(0);
    expect(compareByOrder({ id: 'a', order: 'V' }, { id: 'a', order: 'V' })).toBe(0);
  });
});
