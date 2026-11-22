import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateUmk } from '@stb/crypto';
import { StbDb } from './db.js';
import { loadSearchSnapshot, saveSearchSnapshot } from './search-index-store.js';

const MARKER = 'STB-PLAINTEXT-MARKER-A126';
let db: StbDb;
let n = 0;
beforeEach(async () => {
  db = new StbDb(`stb-v3-searchstore-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Persistierter Suchindex: verschlüsselter Speicher', () => {
  it('A-126: Roundtrip mit derselben UMK; gespeichert ist nur Chiffretext', async () => {
    const umk = await generateUmk();
    const snapshot = { v: 1, stamps: { e1: 'abc' }, index: `{"term":"${MARKER}"}` };
    expect(await loadSearchSnapshot(db, umk)).toBeUndefined(); // noch nichts gespeichert
    await saveSearchSnapshot(db, umk, snapshot);
    expect(JSON.stringify(await db.device.toArray())).not.toContain(MARKER);
    expect(await loadSearchSnapshot(db, umk)).toEqual(snapshot);
  });

  it('A-126: andere UMK, manipulierter Chiffretext oder altes Format ergeben keinen Stand (Neuaufbau statt Fehler)', async () => {
    const umk = await generateUmk();
    await saveSearchSnapshot(db, umk, { v: 1, stamps: {}, index: '{}' });
    expect(await loadSearchSnapshot(db, await generateUmk())).toBeUndefined();
    const row = (await db.device.get('search-index'))!.value as { v: number; ct: string };
    await db.device.put({ id: 'search-index', value: { ...row, ct: row.ct.slice(0, -4) + (row.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') } });
    expect(await loadSearchSnapshot(db, umk)).toBeUndefined();
    await db.device.put({ id: 'search-index', value: { v: 2, ct: row.ct } });
    expect(await loadSearchSnapshot(db, umk)).toBeUndefined();
  });
});
