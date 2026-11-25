import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { generateDiaryKey } from '@stb/crypto';
import { createAesCodec, createDiaryAesCodec } from './aes.js';
import { plainCodec } from './plain.js';
import { createCodecRegistry } from './registry.js';
import { createRecordRepository } from '../repositories/records.js';
import { StbDb } from '../db.js';

const ctx = { diaryId: 'd1', kind: 'entry', recordId: 'r1' };
const MARKER = 'STB-PLAINTEXT-MARKER-DM16';

describe('Codec aes', () => {
  it('DM-16: Roundtrip liefert das Objekt zurück, der Chiffretext enthält keinen Klartext', async () => {
    const codec = createAesCodec(await generateDiaryKey(), () => 1);
    const enc = (await codec.encode({ note: MARKER, n: 3 }, ctx)) as string;
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain(MARKER);
    expect(await codec.decode(enc, ctx)).toEqual({ note: MARKER, n: 3 });
  });

  it('DM-16: falscher Schlüssel → Fehler', async () => {
    const a = createAesCodec(await generateDiaryKey(), () => 1);
    const b = createAesCodec(await generateDiaryKey(), () => 1);
    const enc = await a.encode({ x: 1 }, ctx);
    await expect(b.decode(enc, ctx)).rejects.toMatchObject({ code: 'decrypt-failed' });
  });

  it('DM-16: falsche AAD (Tagebuch, Art oder Record-ID) → Fehler', async () => {
    const codec = createAesCodec(await generateDiaryKey(), () => 1);
    const enc = await codec.encode({ x: 1 }, ctx);
    for (const bad of [{ ...ctx, diaryId: 'd2' }, { ...ctx, kind: 'template' }, { ...ctx, recordId: 'r2' }]) {
      await expect(codec.decode(enc, bad)).rejects.toMatchObject({ code: 'decrypt-failed' });
    }
  });

  it('DM-16: kein String als Rohwert → klarer Fehler; manipulierter Chiffretext → Fehler', async () => {
    const codec = createAesCodec(await generateDiaryKey(), () => 1);
    await expect(codec.decode({ a: 1 }, ctx)).rejects.toThrow(TypeError);
    const enc = (await codec.encode({ x: 1 }, ctx)) as string;
    const flipped = enc.slice(0, -2) + (enc.endsWith('AA') ? 'BB' : 'AA');
    await expect(codec.decode(flipped, ctx)).rejects.toThrow();
  });

  it('DM-16: Tagebuch-Codec nutzt je Tagebuch den eigenen Schlüssel, Epochen im Chiffretext', async () => {
    const k1 = await generateDiaryKey();
    const k2 = await generateDiaryKey();
    const old = await generateDiaryKey();
    const epochs = new Map([['d1', { key: k1, keyEpoch: 2 }], ['d2', { key: k2, keyEpoch: 1 }]]);
    const keys = {
      get: async (id: string) => epochs.get(id)!,
      forEpoch: async (id: string, e: number) => (id === 'd1' && e === 1 ? old : epochs.get(id)?.keyEpoch === e ? epochs.get(id)!.key : undefined),
    };
    const codec = createDiaryAesCodec(keys);
    const e1 = await codec.encode({ a: 1 }, ctx);
    const e2 = await codec.encode({ a: 2 }, { ...ctx, diaryId: 'd2' });
    expect(await codec.decode(e1, ctx)).toEqual({ a: 1 });
    expect(await codec.decode(e2, { ...ctx, diaryId: 'd2' })).toEqual({ a: 2 });
    await expect(codec.decode(e1, { ...ctx, diaryId: 'd2' })).rejects.toThrow(); // anderer Schlüssel/Epoche
    // alter Epoche-Chiffretext wird mit dem Vorgänger gelesen
    const legacy = await createAesCodec(old, () => 1).encode({ a: 0 }, ctx);
    expect(await codec.decode(legacy, ctx)).toEqual({ a: 0 });
    // Gesperrt (kein Schlüssel) → Fehler, nie Klartext
    const locked = createDiaryAesCodec({ get: async () => { throw new Error('Gesperrt'); }, forEpoch: async () => undefined });
    await expect(locked.encode({ a: 1 }, ctx)).rejects.toThrow('Gesperrt');
    await expect(locked.decode(e1, ctx)).rejects.toThrow(/Kein Schlüssel/);
  });

  it('DM-16: gemischter Bestand (plain und aes) ist über das Repository lesbar', async () => {
    const db = new StbDb(`stb-v3-aes-test-${Math.random()}`);
    await db.open();
    try {
      const key = await generateDiaryKey();
      const registry = createCodecRegistry([plainCodec, createDiaryAesCodec({ get: async () => ({ key, keyEpoch: 1 }), forEpoch: async () => key })]);
      const clock = { now: () => 1_700_000_000_000 };
      const plain = createRecordRepository(db, { registry, writeCodec: 'plain', clock, outbox: false });
      const aes = createRecordRepository(db, { registry, writeCodec: 'aes', clock, outbox: false });
      await plain.put({ id: 'a', diaryId: 'd1', kind: 'entry', payload: { n: 'plain' } });
      await aes.put({ id: 'b', diaryId: 'd1', kind: 'entry', payload: { n: MARKER } });
      expect((await db.records.get('a'))?.codec).toBe('plain');
      expect(JSON.stringify(await db.records.get('b'))).not.toContain(MARKER);
      const list = await plain.list('d1', 'entry');
      expect(list.sort((x, y) => x.id.localeCompare(y.id)).map((r) => r.payload)).toEqual([{ n: 'plain' }, { n: MARKER }]);
    } finally {
      db.close();
      await db.delete();
    }
  });
});
