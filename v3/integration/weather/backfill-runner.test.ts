import { describe, it, expect } from 'vitest';
import { createBackfillRunner } from '../../apps/web/src/weather/backfill-runner.js';

describe('Wetter-Nachtrag: Lauf über alle Tagebücher', () => {
  it('BLK-34: Tagebücher werden nacheinander bearbeitet, Ergebnisse summiert', async () => {
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    const runner = createBackfillRunner({
      listDiaryIds: async () => ['a', 'b', 'c'],
      backfillDiary: async (id) => {
        active++;
        maxActive = Math.max(maxActive, active);
        log.push(`start ${id}`);
        await new Promise((r) => setTimeout(r, 5));
        log.push(`ende ${id}`);
        active--;
        return { filled: id === 'b' ? 0 : 1, stillPending: id === 'b' ? 2 : 0 };
      },
    });
    expect(await runner.run()).toEqual({ filled: 2, stillPending: 2 });
    expect(maxActive).toBe(1);
    expect(log).toEqual(['start a', 'ende a', 'start b', 'ende b', 'start c', 'ende c']);
  });

  it('BLK-34: ein Lauf zur Zeit — gleichzeitige Auslöser teilen den laufenden Lauf, danach ist ein neuer möglich', async () => {
    let calls = 0;
    const runner = createBackfillRunner({
      listDiaryIds: async () => ['a'],
      backfillDiary: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 5));
        return { filled: 1, stillPending: 0 };
      },
    });
    const [x, y] = await Promise.all([runner.run(), runner.run()]);
    expect(x).toBe(y);
    expect(calls).toBe(1);
    await runner.run();
    expect(calls).toBe(2);
  });

  it('BLK-34: ein fehlgeschlagenes Tagebuch bricht den Lauf nicht ab; Fehler bleiben ohne Wirkung', async () => {
    const runner = createBackfillRunner({
      listDiaryIds: async () => ['a', 'b'],
      backfillDiary: async (id) => {
        if (id === 'a') throw new Error('offline');
        return { filled: 1, stillPending: 0 };
      },
    });
    expect(await runner.run()).toEqual({ filled: 1, stillPending: 0 });
  });
});
