import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateUmk, generateDiaryKey } from '@stb/crypto';
import { StbDb } from './db.js';
import { createCryptoSession, STAY_UNLOCKED_DEFAULT_DAYS } from './crypto-session.js';

const DAY = 86_400_000;
let db: StbDb;
let n = 0;
let now = 1_700_000_000_000;
const clock = { now: () => now };

beforeEach(async () => {
  now = 1_700_000_000_000;
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
    const s = createCryptoSession(db, clock);
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

  it('CRY-12: „Entsperrt bleiben": nach Reload ohne Passkey entsperrt', async () => {
    const umk = await generateUmk();
    const before = createCryptoSession(db, clock);
    before.unlock(umk);
    await before.stayUnlocked();
    // Reload = neue Session-Instanz auf derselben DB
    const after = createCryptoSession(db, clock);
    expect(await after.restore()).toBe(true);
    expect(after.isUnlocked()).toBe(true);
    expect(await raw(after.umk())).toEqual(await raw(umk));
  });

  it('CRY-12: nach Ablauf (Standard 7 Tage) wieder gesperrt', async () => {
    expect(STAY_UNLOCKED_DEFAULT_DAYS).toBe(7);
    const s = createCryptoSession(db, clock);
    s.unlock(await generateUmk());
    await s.stayUnlocked();
    now += 7 * DAY - 1;
    expect(await createCryptoSession(db, clock).restore()).toBe(true);
    now += 2;
    const later = createCryptoSession(db, clock);
    expect(await later.restore()).toBe(false);
    expect(later.isUnlocked()).toBe(false);
    expect(await db.keys.get('umk-device-wrap')).toBeUndefined();
  });

  it('CRY-12: nach Widerruf sofort wieder gesperrt; Dauer einstellbar', async () => {
    const s = createCryptoSession(db, clock);
    s.unlock(await generateUmk());
    await s.stayUnlocked(1);
    await s.forgetDevice();
    expect(await createCryptoSession(db, clock).restore()).toBe(false);
    expect(await db.device.get('device-key')).toBeUndefined();
  });

  it('CRY-12: Device-Key ist nicht extrahierbar (extractable === false); gespeichert ist nur der UMK-Wrap', async () => {
    const s = createCryptoSession(db, clock);
    const umk = await generateUmk();
    s.unlock(umk);
    await s.stayUnlocked();
    const stored = (await db.device.get('device-key'))?.value as CryptoKey;
    expect(stored).toBeDefined();
    expect(stored.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', stored)).rejects.toThrow();
    const wrap = JSON.stringify(await db.keys.get('umk-device-wrap'));
    expect(wrap).not.toContain(Buffer.from(await raw(umk)).toString('base64'));
  });

  it('CRY-12: ohne Entsperren kein „Entsperrt bleiben"', async () => {
    await expect(createCryptoSession(db, clock).stayUnlocked()).rejects.toThrow();
  });
});
