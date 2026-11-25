import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIdGenerator } from '@stb/core';
import { generateDiaryKey } from '@stb/crypto';
import { StbDb } from '../db.js';
import { plainCodec } from '../codec/plain.js';
import { createAesCodec } from '../codec/aes.js';
import { createCodecRegistry } from '../codec/registry.js';
import { createRecordRepository, type RecordRepository } from './records.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 10) };
const { newId } = createIdGenerator(clock);
const diaryId = newId();

let db: StbDb;
let n = 0;

beforeEach(async () => {
  db = new StbDb(`stb-v3-test-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

async function setup(): Promise<{ repo: RecordRepository; aesRepo: RecordRepository }> {
  const aes = createAesCodec(await generateDiaryKey(), () => 1);
  const registry = createCodecRegistry([plainCodec, aes]);
  return {
    repo: createRecordRepository(db, { registry, writeCodec: 'plain', clock, outbox: true }),
    aesRepo: createRecordRepository(db, { registry, writeCodec: 'aes', clock, outbox: true }),
  };
}

describe('Record-Repository', () => {
  it('DM-12: Records mit codec plain und aes liegen nebeneinander in derselben DB und sind lesbar', async () => {
    const { repo, aesRepo } = await setup();
    const a = newId();
    const b = newId();
    await repo.put({ id: a, diaryId, kind: 'entry', payload: { note: 'STB-PLAINTEXT-MARKER-1' }, occurredAt: '2026-01-01T10:00:00Z' });
    await aesRepo.put({ id: b, diaryId, kind: 'entry', payload: { note: 'STB-PLAINTEXT-MARKER-2' }, occurredAt: '2026-01-02T10:00:00Z' });

    const rawA = await db.records.get(a);
    const rawB = await db.records.get(b);
    expect(rawA?.codec).toBe('plain');
    expect(rawB?.codec).toBe('aes');
    expect(JSON.stringify(rawB)).not.toContain('STB-PLAINTEXT-MARKER');

    // beide Repositories lesen beide Codecs (Lesen richtet sich nach record.codec, nicht nach writeCodec)
    for (const r of [repo, aesRepo]) {
      expect((await r.get(a))?.payload).toEqual({ note: 'STB-PLAINTEXT-MARKER-1' });
      expect((await r.get(b))?.payload).toEqual({ note: 'STB-PLAINTEXT-MARKER-2' });
    }
    const listed = await repo.list(diaryId, 'entry');
    expect(listed.map((x) => x.payload)).toEqual([{ note: 'STB-PLAINTEXT-MARKER-1' }, { note: 'STB-PLAINTEXT-MARKER-2' }]);
  });

  it('DM-12: unbekannter Codec beim Lesen ergibt einen klaren Fehler', async () => {
    const { repo } = await setup();
    const id = newId();
    await db.records.put({ id, diaryId, kind: 'entry', rev: 0, deleted: 0, codec: 'xyz', payload: '?', localUpdatedAt: 1 });
    await expect(repo.get(id)).rejects.toThrow(/Codec "xyz"/);
  });

  it('DM-10: Schreiben legt Record und genau eine Outbox-Op in einer Transaktion an', async () => {
    const { repo } = await setup();
    const id = newId();
    await repo.put({ id, diaryId, kind: 'entry', payload: { v: 1 } });
    await repo.put({ id, diaryId, kind: 'entry', payload: { v: 2 } });
    expect(await db.records.count()).toBe(1);
    const ops = await db.outbox.where('recordId').equals(id).toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ recordId: id, diaryId, kind: 'entry', op: 'upsert', baseRev: 0, attempts: 0 });
  });

  it('DM-10: wirft die Validierung, existiert weder Record noch Outbox-Eintrag', async () => {
    const { repo } = await setup();
    const id = newId();
    const validate = () => {
      throw new Error('ungültig');
    };
    await expect(repo.put({ id, diaryId, kind: 'entry', payload: { v: 1 } }, { validate })).rejects.toThrow('ungültig');
    expect(await db.records.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('DM-10: wirft der Codec, existiert weder Record noch Outbox-Eintrag', async () => {
    const failing = { id: 'plain', encode: async () => { throw new Error('codec kaputt'); }, decode: async (raw: unknown) => raw };
    const repo = createRecordRepository(db, { registry: createCodecRegistry([failing]), writeCodec: 'plain', clock, outbox: true });
    await expect(repo.put({ id: newId(), diaryId, kind: 'entry', payload: {} })).rejects.toThrow('codec kaputt');
    expect(await db.records.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('DM-10: scheitert der Outbox-Eintrag, wird auch der Record zurückgerollt (bestehender Stand bleibt)', async () => {
    const { repo } = await setup();
    const id = newId();
    await repo.put({ id, diaryId, kind: 'entry', payload: { v: 1 } });
    await db.outbox.clear();
    const unsubscribe = db.outbox.hook('creating', () => {
      throw new Error('outbox voll');
    });
    await expect(repo.put({ id, diaryId, kind: 'entry', payload: { v: 2 } })).rejects.toThrow('outbox voll');
    db.outbox.hook('creating').unsubscribe(unsubscribe);
    expect((await repo.get(id))?.payload).toEqual({ v: 1 });
    expect(await db.outbox.count()).toBe(0);
  });

  it('DM-10: im Modus local-only wird keine Outbox befüllt; Löschen ist ein Soft-Delete mit Outbox-Op', async () => {
    const registry = createCodecRegistry([plainCodec]);
    const local = createRecordRepository(db, { registry, writeCodec: 'plain', clock, outbox: false });
    const id = newId();
    await local.put({ id, diaryId, kind: 'entry', payload: { v: 1 } });
    expect(await db.outbox.count()).toBe(0);
    const cloud = createRecordRepository(db, { registry, writeCodec: 'plain', clock, outbox: true });
    await cloud.remove(id);
    expect((await db.records.get(id))?.deleted).toBe(1);
    expect(await db.outbox.toArray()).toMatchObject([{ recordId: id, op: 'delete' }]);
    expect(await cloud.list(diaryId, 'entry')).toEqual([]);
  });
});
