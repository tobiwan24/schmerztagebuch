import { describe, it, expect } from 'vitest';
import { createHlcClock, compareHlc, formatHlc, parseHlc, maxHlc } from './hlc.js';

describe('Hybrid Logical Clock', () => {
  it('SYN-05: Format ist lexikografisch sortierbar und rund parsebar', () => {
    const h = formatHlc({ ms: 1_700_000_000_123, counter: 10, node: 'devA' });
    expect(h).toBe('1700000000123:000a:devA');
    expect(parseHlc(h)).toEqual({ ms: 1_700_000_000_123, counter: 10, node: 'devA' });
    expect(() => parseHlc('kaputt')).toThrow();
    expect(() => formatHlc({ ms: 1, counter: 0, node: 'a:b' })).toThrow();
  });

  it('SYN-05: Vergleich nach Zeit, dann Zähler, dann Knoten', () => {
    expect(compareHlc('1700000000000:0000:a', '1700000000001:0000:a')).toBeLessThan(0);
    expect(compareHlc('1700000000000:0002:a', '1700000000000:0001:z')).toBeGreaterThan(0);
    expect(compareHlc('1700000000000:0001:b', '1700000000000:0001:a')).toBeGreaterThan(0);
    expect(compareHlc('1700000000000:0001:a', '1700000000000:0001:a')).toBe(0);
    expect(maxHlc('1700000000000:0001:a', '1700000000000:0002:a')).toBe('1700000000000:0002:a');
  });

  it('SYN-05: tick ist streng monoton, auch bei gleicher oder zurückspringender Uhr', () => {
    const times = [1000, 1000, 1000, 900, 2000];
    let i = 0;
    const clock = createHlcClock({ now: () => times[Math.min(i++, times.length - 1)]! }, 'devA');
    const hs = times.map(() => clock.tick());
    for (let k = 1; k < hs.length; k++) expect(compareHlc(hs[k]!, hs[k - 1]!)).toBeGreaterThan(0);
    expect(hs[3]).toBe('0000000001000:0003:devA');
    expect(hs[4]).toBe('0000000002000:0000:devA');
  });

  it('SYN-05: receive übernimmt eine entfernte, neuere Zeit; nachfolgende ticks liegen darüber', () => {
    const clock = createHlcClock({ now: () => 1000 }, 'devA');
    const remote = '0000000005000:0007:devB';
    const after = clock.receive(remote);
    expect(compareHlc(after, remote)).toBeGreaterThan(0);
    expect(parseHlc(after)).toEqual({ ms: 5000, counter: 8, node: 'devA' });
    expect(compareHlc(clock.tick(), after)).toBeGreaterThan(0);
  });
});
