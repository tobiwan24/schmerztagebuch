import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateDiaryKey } from '@stb/crypto';
import { createDiaryAesCodec } from './aes.js';
import { plainCodec } from './plain.js';
import { createCodecRegistry } from './registry.js';
import { countByCodec, migrateRecords } from './migrate.js';
import { createRecordRepository } from '../repositories/records.js';
import { StbDb, type LocalRecord } from '../db.js';
import type { PayloadCodec } from './types.js';

const MARKER = 'STB-PLAINTEXT-MARKER-DM17';
const clock = { now: () => 1_700_000_000_000 };
let db: StbDb;
let n = 0;
let aes: PayloadCodec;
let key: CryptoKey;

beforeEach(async () => {
  db = new StbDb(`stb-v3-migrate-${++n}`);
  await db.open();
  key = await generateDiaryKey();
  aes = createDiaryAesCodec({ get: async () => ({ key, keyEpoch: 1 }), forEpoch: async () => key });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const registry = () => createCodecRegistry([plainCodec, aes]);
const ctxOf = (id: string) => ({ diaryId: 'd1', kind: 'entry', recordId: id });

/** `count` Einträge mit Marker im Payload; jeder zweite mit `base` und Outbox-Eintrag. */
async function seed(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const id = `r${String(i).padStart(3, '0')}`;
    const at = `2026-03-0${(i % 9) + 1}T0${i % 10}:30:00Z`;
    const rec: LocalRecord = {
      id, diaryId: 'd1', kind: 'entry', rev: i % 2, deleted: 0, codec: 'plain',
      payload: JSON.stringify({ id, note: `${MARKER}-${i}`, occurredAt: at }), localUpdatedAt: 1000 + i, occurredAt: at,
      ...(i % 2 ? { base: JSON.stringify({ id, note: `${MARKER}-base-${i}` }) } : {}),
    };
    await db.records.put(rec);
    if (i % 2) await db.outbox.add({ recordId: id, diaryId: 'd1', kind: 'entry', op: 'upsert', baseRev: 1, createdAt: 5, attempts: 0 });
  }
}

const rawDump = async (): Promise<string> => JSON.stringify([await db.records.toArray(), await db.outbox.toArray()]);
const readAll = async () => {
  const repo = createRecordRepository(db, { registry: registry(), writeCodec: 'aes', clock, outbox: false });
  return (await repo.list('d1', 'entry')).sort((a, b) => a.id.localeCompare(b.id));
};

describe('Migration plain → aes', () => {
  it('DM-17: alle Records, base eingeschlossen, sind danach aes ohne Klartext-Marker; Index nur mit Tag', async () => {
    await seed(7);
    const before = await readAll();
    const res = await migrateRecords(db, { registry: registry(), batchSize: 3 });
    expect(res).toMatchObject({ migrated: 7, skipped: 0, failed: [], remaining: 0, aborted: false });
    expect(await rawDump()).not.toContain(MARKER);
    expect((await readAll()).map((r) => r.payload)).toEqual(before.map((r) => r.payload));
    for (const r of await db.records.toArray()) {
      expect(r.codec).toBe('aes');
      expect(r.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.base === undefined || typeof r.base === 'string').toBe(true);
    }
    // base wurde mitverschlüsselt und ist mit dem aes-Codec lesbar
    const withBase = (await db.records.toArray()).find((r) => r.base !== undefined)!;
    expect(await aes.decode(withBase.base, ctxOf(withBase.id))).toMatchObject({ note: expect.stringContaining(MARKER) });
  });

  it('DM-17: idempotent — ein zweiter Lauf ändert nichts', async () => {
    await seed(5);
    await migrateRecords(db, { registry: registry() });
    const first = await db.records.toArray();
    const again = await migrateRecords(db, { registry: registry() });
    expect(again).toMatchObject({ migrated: 0, remaining: 0 });
    expect(await db.records.toArray()).toEqual(first);
  });

  it('DM-17: Abbruch nach dem ersten Batch hinterlässt einen lesbaren gemischten Bestand; Fortsetzen beendet die Migration', async () => {
    await seed(9);
    const before = await readAll();
    const ctl = new AbortController();
    const part = await migrateRecords(db, { registry: registry(), batchSize: 2, signal: ctl.signal, onProgress: () => ctl.abort() });
    expect(part.aborted).toBe(true);
    expect(part.migrated).toBe(2);
    expect(part.remaining).toBe(7);
    expect(await countByCodec(db, 'aes')).toBe(2);
    expect((await readAll()).map((r) => r.payload)).toEqual(before.map((r) => r.payload)); // gemischt lesbar
    const rest = await migrateRecords(db, { registry: registry(), batchSize: 2 });
    expect(rest).toMatchObject({ migrated: 7, remaining: 0 });
    expect(await rawDump()).not.toContain(MARKER);
    expect((await readAll()).map((r) => r.payload)).toEqual(before.map((r) => r.payload));
  });

  it('DM-17: Fault-Injection — wirft der Ziel-Codec, bleibt der Record unverändert (nie überschrieben); nach Behebung wird er migriert', async () => {
    await seed(6);
    const original = new Map((await db.records.toArray()).map((r) => [r.id, JSON.stringify(r)]));
    let calls = 0;
    const flaky: PayloadCodec = {
      ...aes,
      encode: async (o, c) => {
        if (++calls === 3) throw new Error('Speicher voll');
        return aes.encode(o, c);
      },
    };
    const res = await migrateRecords(db, { registry: createCodecRegistry([plainCodec, flaky]), batchSize: 4 });
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]!.reason).toBe('Speicher voll');
    expect(res.remaining).toBe(1);
    const stuck = await db.records.get(res.failed[0]!.id);
    expect(JSON.stringify(stuck)).toBe(original.get(stuck!.id));
    expect(await readAll()).toHaveLength(6);
    const fixed = await migrateRecords(db, { registry: registry() });
    expect(fixed).toMatchObject({ migrated: 1, failed: [], remaining: 0 });
    expect(await rawDump()).not.toContain(MARKER);
  });

  it('DM-17: Fault-Injection — abweichende Gegenprobe verhindert das Überschreiben', async () => {
    await seed(3);
    const original = JSON.stringify(await db.records.toArray());
    const lying: PayloadCodec = { ...aes, decode: async () => ({ kaputt: true }) };
    const res = await migrateRecords(db, { registry: createCodecRegistry([plainCodec, lying]) });
    expect(res.migrated).toBe(0);
    expect(res.failed).toHaveLength(3);
    expect(res.remaining).toBe(3);
    expect(JSON.stringify(await db.records.toArray())).toBe(original);
  });

  it('DM-17: Fault-Injection — scheitert die Transaktion, ist kein Record halb umgeschrieben', async () => {
    await seed(4);
    const original = JSON.stringify(await db.records.toArray());
    const realPut = db.records.put.bind(db.records);
    let puts = 0;
    db.records.put = ((r: LocalRecord) => (++puts === 3 ? Promise.reject(new Error('Absturz')) : realPut(r))) as typeof db.records.put;
    await expect(migrateRecords(db, { registry: registry(), batchSize: 10 })).rejects.toThrow('Absturz');
    db.records.put = realPut as typeof db.records.put;
    expect(JSON.stringify(await db.records.toArray())).toBe(original); // Batch atomar: nichts übernommen
    expect(await migrateRecords(db, { registry: registry(), batchSize: 10 })).toMatchObject({ migrated: 4, remaining: 0 });
  });

  it('DM-17: Änderung während der Migration wird nicht überschrieben (skipped) und im nächsten Durchgang migriert', async () => {
    await seed(2);
    let hook = true;
    const racing: PayloadCodec = {
      ...aes,
      encode: async (o, c) => {
        if (hook && c.recordId === 'r000') {
          hook = false;
          await db.records.update('r000', { payload: JSON.stringify({ id: 'r000', note: 'neu geschrieben' }), localUpdatedAt: 99_999 });
        }
        return aes.encode(o, c);
      },
    };
    const res = await migrateRecords(db, { registry: createCodecRegistry([plainCodec, racing]) });
    expect(res.skipped).toBe(1);
    expect(res).toMatchObject({ migrated: 2, remaining: 0 });
    const r0 = (await readAll()).find((r) => r.id === 'r000')!;
    expect(r0.payload).toEqual({ id: 'r000', note: 'neu geschrieben' });
  });

  it('DM-17: die Outbox bleibt unverändert und enthält keine fachlichen Felder', async () => {
    await seed(6);
    const before = await db.outbox.toArray();
    await migrateRecords(db, { registry: registry() });
    expect(await db.outbox.toArray()).toEqual(before);
    for (const op of before) expect(Object.keys(op).sort()).toEqual(['attempts', 'baseRev', 'createdAt', 'diaryId', 'kind', 'op', 'recordId', 'seq']);
  });

  it('DM-17: Schreiben mit aes während laufender Migration kodiert ein vorhandenes plain-base mit um', async () => {
    await seed(2);
    const repo = createRecordRepository(db, { registry: registry(), writeCodec: 'aes', clock, outbox: false });
    await repo.put({ id: 'r001', diaryId: 'd1', kind: 'entry', payload: { id: 'r001', note: `${MARKER}-neu` }, occurredAt: '2026-05-05T10:00:00Z' });
    const rec = (await db.records.get('r001'))!;
    expect(rec.codec).toBe('aes');
    expect(rec.occurredAt).toBe('2026-05-05');
    expect(await aes.decode(rec.base, ctxOf('r001'))).toMatchObject({ note: `${MARKER}-base-1` });
    await repo.remove('r001', { id: 'r001', gone: true });
    const del = (await db.records.get('r001'))!;
    expect(del.deleted).toBe(1);
    expect(await aes.decode(del.base, ctxOf('r001'))).toMatchObject({ note: `${MARKER}-base-1` });
    expect(await migrateRecords(db, { registry: registry() })).toMatchObject({ remaining: 0, failed: [] });
    expect(await rawDump()).not.toContain(MARKER);
  });
});
