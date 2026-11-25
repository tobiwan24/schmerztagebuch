import { describe, it, expect } from 'vitest';
import { createSingleFlight } from './single-flight.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Sync-Single-Flight', () => {
  it('SYN-13: gleichzeitige Auslöser führen zu genau einem Lauf + höchstens einem Folgelauf, nie parallel', async () => {
    const runs: ReturnType<typeof deferred>[] = [];
    let active = 0;
    let maxActive = 0;
    const sf = createSingleFlight(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      const d = deferred();
      runs.push(d);
      try {
        await d.promise;
      } finally {
        active--;
      }
    });

    const first = sf.trigger();
    const others = [sf.trigger(), sf.trigger(), sf.trigger(), sf.trigger()];
    await Promise.resolve();
    expect(runs).toHaveLength(1);
    runs[0]!.resolve();
    await first;
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toHaveLength(2); // genau ein Folgelauf für alle vier Auslöser
    runs[1]!.resolve();
    await Promise.all(others);
    expect(runs).toHaveLength(2);
    expect(maxActive).toBe(1);
  });

  it('SYN-13: Auslöser während des Folgelaufs erzeugen wieder höchstens einen weiteren Lauf', async () => {
    let count = 0;
    const gates: ReturnType<typeof deferred>[] = [];
    const sf = createSingleFlight(async () => {
      count++;
      const d = deferred();
      gates.push(d);
      await d.promise;
    });
    const a = sf.trigger();
    const b = sf.trigger();
    await Promise.resolve();
    gates[0]!.resolve();
    await a;
    await new Promise((r) => setTimeout(r, 0));
    const c = sf.trigger(); // während Folgelauf
    const d2 = sf.trigger();
    gates[1]!.resolve();
    await b;
    await new Promise((r) => setTimeout(r, 0));
    gates[2]!.resolve();
    await Promise.all([c, d2]);
    expect(count).toBe(3);
  });

  it('SYN-13: Fehler im Lauf blockiert nicht; nach Leerlauf startet ein Auslöser sofort einen neuen Lauf', async () => {
    let count = 0;
    const sf = createSingleFlight(async () => {
      count++;
      if (count === 1) throw new Error('offline');
    });
    await expect(sf.trigger()).rejects.toThrow('offline');
    expect(sf.running).toBe(false);
    await sf.trigger();
    expect(count).toBe(2);
  });
});
