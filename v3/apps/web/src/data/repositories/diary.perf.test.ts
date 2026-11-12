// BLK-08: Eintrag offline speichern dauert < 100 ms (Median über 50 Speichervorgänge, fake-indexeddb).
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { TEMPLATE_CATALOG, createIdGenerator, instantiateCatalogTemplate, type Entry } from '@stb/core';
import { StbDb } from '../db.js';
import { plainCodec } from '../codec/plain.js';
import { createCodecRegistry } from '../codec/registry.js';
import { createRecordRepository } from './records.js';
import { createDiaryRepository } from './diary.js';

const RUNS = 50;
const BUDGET_MS = 100;

describe('Performance', () => {
  it('BLK-08: Eintrag speichern (Validierung + Codec + Record + Outbox) — Median über 50 Vorgänge < 100 ms', async () => {
    const clock = { now: () => performance.timeOrigin + performance.now() };
    const { newId } = createIdGenerator(clock);
    const db = new StbDb('stb-v3-perf');
    await db.open();
    try {
      const repo = createDiaryRepository(
        createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: true }),
      );
      const diaryId = newId();
      // realistische Vorlage aus dem Katalog (Slider, Multiselects, Textarea)
      const state = instantiateCatalogTemplate(TEMPLATE_CATALOG.find((c) => c.id === 'headache')!.id, { id: newId(), diaryId, order: 'V', newId }, clock);
      await repo.saveTemplate(state);
      const [pain, kind, meds, , notes] = [...state.version.blocks].sort((a, b) => (a.order < b.order ? -1 : 1));
      const optionOf = (b: typeof kind) => (b?.type === 'multiselect' ? [b.config.options[0]!.id] : []);

      const durations: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const now = new Date(clock.now()).toISOString();
        const entry: Entry = {
          id: newId(), diaryId, templateId: state.template.id, templateVersion: 1,
          occurredAt: now, recordedAt: now, updatedAt: now, authorId: 'user-1',
          values: { [pain!.id]: i % 11, [kind!.id]: optionOf(kind), [meds!.id]: optionOf(meds), [notes!.id]: { text: `Eintrag ${i}` } },
          tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `${String(i).padStart(13, '0')}:0000:dev1`,
        };
        const start = performance.now();
        await repo.saveEntry(entry);
        durations.push(performance.now() - start);
      }
      durations.sort((a, b) => a - b);
      const median = (durations[RUNS / 2 - 1]! + durations[RUNS / 2]!) / 2;
      expect(await db.records.where('[diaryId+kind]').equals([diaryId, 'entry']).count()).toBe(RUNS);
      expect(median, `Median ${median.toFixed(2)} ms`).toBeLessThan(BUDGET_MS);
    } finally {
      db.close();
      await db.delete();
    }
  });
});
