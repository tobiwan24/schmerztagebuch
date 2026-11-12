import { describe, it, expect } from 'vitest';
import { createIdGenerator, idTimestamp, isUuidV7 } from './ids.js';
import type { Clock, Random } from './env.js';

const fixedClock = (ms: number): Clock => ({ now: () => ms });
/** Deterministische Zufallsquelle (xorshift) für reproduzierbare Tests. */
function seededRandom(seed = 1): Random {
  let s = seed >>> 0 || 1;
  return {
    fill(t) {
      for (let i = 0; i < t.length; i++) {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        t[i] = s & 0xff;
      }
      return t;
    },
  };
}

describe('UUID v7', () => {
  it('DM-01: newId() erzeugt gültige UUID v7 (Version 7, Variante 10)', () => {
    const { newId } = createIdGenerator(fixedClock(1_700_000_000_000));
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuidV7(id)).toBe(true);
    expect(isUuidV7('00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(isUuidV7('nicht-eine-id')).toBe(false);
  });

  it('DM-01: 10.000 IDs in einer Schleife sind eindeutig und lexikografisch aufsteigend (gleiche Millisekunde)', () => {
    const { newId } = createIdGenerator(fixedClock(1_700_000_000_000), seededRandom(7));
    const ids = Array.from({ length: 10_000 }, () => newId());
    expect(new Set(ids).size).toBe(10_000);
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!).toBe(true);
  });

  it('DM-01: monoton auch bei fortschreitender und zurückspringender Uhr', () => {
    const times = [1000, 1000, 1001, 999, 999, 1500, 1500, 1200];
    let i = 0;
    const { newId } = createIdGenerator({ now: () => times[Math.min(i++, times.length - 1)]! });
    const ids = times.map(() => newId());
    for (let k = 1; k < ids.length; k++) expect(ids[k]! > ids[k - 1]!).toBe(true);
    expect(isUuidV7(ids[3]!)).toBe(true);
  });

  it('DM-01: Standard-Zufallsquelle ist crypto.getRandomValues', () => {
    const { newId } = createIdGenerator(fixedClock(5));
    const a = createIdGenerator(fixedClock(5)).newId();
    expect(newId()).not.toBe(a);
  });

  it('DM-02: Zeitstempel ist aus der ID rekonstruierbar (±1 ms)', () => {
    for (const ms of [0, 1, 1_700_000_000_123, 2 ** 48 - 1]) {
      const { newId } = createIdGenerator(fixedClock(ms), seededRandom(ms + 1));
      expect(Math.abs(idTimestamp(newId()) - ms)).toBeLessThanOrEqual(1);
    }
    expect(() => idTimestamp('kaputt')).toThrow();
  });
});
