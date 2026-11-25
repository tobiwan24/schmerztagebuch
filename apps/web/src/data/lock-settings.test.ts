import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StbDb } from './db.js';
import { DEFAULT_LOCK_SETTINGS, IDLE_MINUTES_OPTIONS, createIdleMonitor, loadLockSettings, saveLockSettings } from './lock-settings.js';

const MIN = 60_000;
let db: StbDb;
let n = 0;
let now = 1_700_000_000_000;
const clock = { now: () => now };

beforeEach(async () => {
  now = 1_700_000_000_000;
  db = new StbDb(`stb-v3-lock-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Sperr-Einstellungen', () => {
  it('CRY-20: Standard 30 Minuten Inaktivität, nur Aus/5/15/30/60; gespeichertes „stayDays“ früherer Versionen wird ignoriert', async () => {
    expect(await loadLockSettings(db)).toEqual({ idleMinutes: 30 });
    expect(DEFAULT_LOCK_SETTINGS).toEqual({ idleMinutes: 30 });
    expect(IDLE_MINUTES_OPTIONS).toEqual([0, 5, 15, 30, 60]);
    expect(await saveLockSettings(db, { idleMinutes: 15 })).toEqual({ idleMinutes: 15 });
    expect(await saveLockSettings(db, { idleMinutes: 7 })).toEqual({ idleMinutes: 30 }); // ungültig → Standard
    expect(await saveLockSettings(db, { idleMinutes: 0 })).toEqual({ idleMinutes: 0 });
    await db.device.put({ id: 'lock-settings', value: { stayDays: 12, idleMinutes: 5 } });
    expect(await loadLockSettings(db)).toEqual({ idleMinutes: 5 });
  });

  it('CRY-20: Inaktivitäts-Sperre löst nach der eingestellten Zeit aus, Aktivität setzt zurück, „Aus" sperrt nie', () => {
    let locked = 0;
    const m = createIdleMonitor(clock, () => locked++);
    now += 29 * MIN;
    expect(m.check(30)).toBe(false);
    m.touch(); // Aktivität
    now += 29 * MIN;
    expect(m.check(30)).toBe(false);
    now += 1 * MIN;
    expect(m.check(30)).toBe(true);
    expect(locked).toBe(1);

    m.touch();
    now += 5 * MIN;
    expect(m.check(5)).toBe(true);
    expect(locked).toBe(2);

    m.touch();
    now += 24 * 60 * MIN;
    expect(m.check(0)).toBe(false); // Aus
    expect(locked).toBe(2);
  });
});
