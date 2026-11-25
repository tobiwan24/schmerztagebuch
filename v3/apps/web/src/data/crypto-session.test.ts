import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateUmk, generateDiaryKey, deriveLocalDiaryKey } from '@stb/crypto';
import { StbDb } from './db.js';
import { createCryptoSession } from './crypto-session.js';

let db: StbDb;
let n = 0;

beforeEach(async () => {
  db = new StbDb(`stb-v3-session-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));

describe('Crypto-Session', () => {
  it('CRY-12: Schlüssel nur im Speicher; Sperren verwirft sie', async () => {
    const s = createCryptoSession(db);
    expect(s.isUnlocked()).toBe(false);
    const umk = await generateUmk();
    s.unlock(umk);
    const dk = await generateDiaryKey();
    s.setDiaryKey('d1', dk, 3);
    expect(await s.keys.get('d1')).toEqual({ key: dk, keyEpoch: 3 });
    s.lock();
    expect(s.isUnlocked()).toBe(false);
    await expect(s.keys.get('d1')).rejects.toThrow();
  });

  it('A-125: Tagebuch ohne Konto-DK bekommt den aus der UMK abgeleiteten DK (Epoche 1); Cloud-Tagebuch ohne DK nie', async () => {
    const s = createCryptoSession(db);
    const umk = await generateUmk();
    await expect(s.keys.get('d-local')).rejects.toThrow('Gesperrt');
    s.unlock(umk);
    const local = await s.keys.get('d-local');
    expect(local.keyEpoch).toBe(1);
    expect(await raw(local.key)).toEqual(await raw(await deriveLocalDiaryKey(umk, 'd-local')));
    expect(await s.keys.forEpoch('d-local', 1)).toBeDefined();
    expect(await s.keys.forEpoch('d-local', 2)).toBeUndefined();
    // gleiche UMK, neue Sitzung (Neustart) → gleicher Schlüssel
    const again = createCryptoSession(db);
    again.unlock(umk);
    expect(await raw((await again.keys.get('d-local')).key)).toEqual(await raw(local.key));
    // Cloud-Tagebuch: ohne geladenen DK kein Schlüssel (kein Ableiten), mit DK der Konto-DK
    await db.sync_state.put({ diaryId: 'd-cloud', cursor: 0, mode: 'cloud-primary' });
    await expect(s.keys.get('d-cloud')).rejects.toThrow('Kein Schlüssel');
    expect(await s.keys.forEpoch('d-cloud', 1)).toBeUndefined();
    const dk = await generateDiaryKey();
    s.setDiaryKey('d-cloud', dk, 1);
    expect((await s.keys.get('d-cloud')).key).toBe(dk);
    // Sperren verwirft auch abgeleitete Schlüssel
    s.lock();
    await expect(s.keys.get('d-local')).rejects.toThrow();
  });

  it('CRY-25: Device-Key und -Wrap früherer Versionen („entsperrt bleiben“) werden gelöscht', async () => {
    await db.device.put({ id: 'device-key', value: 'alt' });
    await db.keys.put({ id: 'umk-device-wrap', value: { wrapped: 'x', expiresAt: 1 } });
    await createCryptoSession(db).forgetDevice();
    expect(await db.device.get('device-key')).toBeUndefined();
    expect(await db.keys.get('umk-device-wrap')).toBeUndefined();
  });

  it('SHR-13: zwei Epochen je Tagebuch — aktuelle und vorherige lesbar, unbekannte nicht; Sperren verwirft beide', async () => {
    const s = createCryptoSession(db);
    s.unlock(await generateUmk());
    const [old, next] = [await generateDiaryKey(), await generateDiaryKey()];
    s.setDiaryKey('d1', old, 1);
    s.setDiaryKey('d1', next, 2, { key: old, keyEpoch: 1 });
    expect(await s.keys.get('d1')).toEqual({ key: next, keyEpoch: 2 });
    expect(await s.keys.forEpoch('d1', 2)).toBe(next);
    expect(await s.keys.forEpoch('d1', 1)).toBe(old);
    expect(await s.keys.forEpoch('d1', 3)).toBeUndefined();
    // Wrap derselben Epoche erneut gesetzt (ohne Vorgänger): Vorgänger bleibt
    s.setDiaryKey('d1', next, 2);
    expect(await s.keys.forEpoch('d1', 1)).toBe(old);
    // neue Epoche ohne Vorgänger: der alte Vorgänger entfällt
    s.setDiaryKey('d1', await generateDiaryKey(), 3);
    expect(await s.keys.forEpoch('d1', 1)).toBeUndefined();
    s.lock();
    await expect(s.keys.forEpoch('d1', 2)).rejects.toThrow();
  });
});
