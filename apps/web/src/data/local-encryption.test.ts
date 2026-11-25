import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StbDb } from './db.js';
import { enableLocalEncryption, loadLocalEncryption, markLocalEncryptionComplete } from './local-encryption.js';

let db: StbDb;
let n = 0;
let now = Date.parse('2026-11-17T10:00:00Z');
beforeEach(async () => {
  db = new StbDb(`stb-v3-localenc-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Einstellung lokale Verschlüsselung (A-125)', () => {
  it('A-125: Standard aus; Einschalten ist fest und idempotent; Abschluss wird nur bei eingeschalteter Einstellung vermerkt', async () => {
    expect(await loadLocalEncryption(db)).toEqual({ enabled: false });
    expect(await markLocalEncryptionComplete(db, () => now)).toEqual({ enabled: false });
    const on = await enableLocalEncryption(db, () => now);
    expect(on).toEqual({ enabled: true, enabledAt: '2026-11-17T10:00:00.000Z' });
    now += 60_000;
    expect(await enableLocalEncryption(db, () => now)).toEqual(on); // zweites Einschalten ändert nichts
    const done = await markLocalEncryptionComplete(db, () => now);
    expect(done.completedAt).toBe('2026-11-17T10:01:00.000Z');
    expect(await loadLocalEncryption(db)).toEqual(done);
    now += 60_000;
    expect((await markLocalEncryptionComplete(db, () => now)).completedAt).toBe(done.completedAt);
  });
});
