import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIdGenerator } from '@stb/core';
import { StbDb } from '../db.js';
import { plainCodec } from '../codec/plain.js';
import { createCodecRegistry } from '../codec/registry.js';
import { createRecordRepository, type RecordRepository } from './records.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 10) };
const { newId } = createIdGenerator(clock);
const diaryId = newId();

let db: StbDb;
let repo: RecordRepository;
let n = 0;
beforeEach(async () => {
  db = new StbDb(`stb-v3-outbox-${++n}`);
  await db.open();
  repo = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: true });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Outbox', () => {
  it('SYN-02: mehrere Änderungen am selben Record ergeben genau eine Outbox-Op mit der ältesten baseRev', async () => {
    const id = newId();
    await repo.put({ id, diaryId, kind: 'entry', payload: { v: 1 } });
    await db.records.update(id, { rev: 3 }); // z. B. Serverstand eingetroffen, Op noch nicht gepusht
    await repo.put({ id, diaryId, kind: 'entry', payload: { v: 2 } });
    await db.records.update(id, { rev: 4 });
    await repo.put({ id, diaryId, kind: 'entry', payload: { v: 3 } });
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ recordId: id, op: 'upsert', baseRev: 0 });
    expect((await repo.get(id))?.payload).toEqual({ v: 3 });
  });

  it('SYN-02: Änderung und anschließendes Löschen ergeben eine delete-Op; Ops verschiedener Records bleiben getrennt', async () => {
    const a = newId();
    const b = newId();
    await repo.put({ id: a, diaryId, kind: 'entry', payload: { v: 1 } });
    await repo.put({ id: b, diaryId, kind: 'entry', payload: { v: 1 } });
    await repo.put({ id: a, diaryId, kind: 'entry', payload: { v: 2 } });
    await repo.remove(a);
    const ops = await db.outbox.orderBy('seq').toArray();
    expect(ops.map((o) => [o.recordId, o.op])).toEqual([[a, 'delete'], [b, 'upsert']]);
  });
});
