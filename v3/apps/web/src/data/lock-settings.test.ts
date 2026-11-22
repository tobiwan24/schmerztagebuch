import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateUmk } from '@stb/crypto';
import { StbDb } from './db.js';
import { createCryptoSession } from './crypto-session.js';
import { DEFAULT_LOCK_SETTINGS, IDLE_MINUTES_OPTIONS, createIdleMonitor, loadLockSettings, saveLockSettings } from './lock-settings.js';

const DAY = 86_400_000;
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
  it('CRY-20: Standard 7 Tage und 30 Minuten Inaktivität; Dauer auf 1–30 Tage begrenzt, Inaktivität nur Aus/5/15/30/60', async () => {
    expect(await loadLockSettings(db)).toEqual({ stayDays: 7, idleMinutes: 30 });
    expect(DEFAULT_LOCK_SETTINGS).toEqual({ stayDays: 7, idleMinutes: 30 });
    expect(IDLE_MINUTES_OPTIONS).toEqual([0, 5, 15, 30, 60]);
    expect(await saveLockSettings(db, { stayDays: 99 })).toEqual({ stayDays: 30, idleMinutes: 30 });
    expect(await saveLockSettings(db, { stayDays: 0 })).toEqual({ stayDays: 1, idleMinutes: 30 });
    expect(await saveLockSettings(db, { stayDays: 12.6 })).toEqual({ stayDays: 13, idleMinutes: 30 });
    expect(await saveLockSettings(db, { idleMinutes: 15 })).toEqual({ stayDays: 13, idleMinutes: 15 });
    expect(await saveLockSettings(db, { idleMinutes: 7 })).toEqual({ stayDays: 13, idleMinutes: 30 }); // ungültig → Standard
    expect(await saveLockSettings(db, { idleMinutes: 0 })).toEqual({ stayDays: 13, idleMinutes: 0 });
    expect(await loadLockSettings(db)).toEqual({ stayDays: 13, idleMinutes: 0 });
  });

  it('CRY-20: „Entsperrt bleiben" läuft nach der eingestellten Dauer ab (gefälschte Uhr) und lässt sich widerrufen', async () => {
    const umk = await generateUmk();
    const s = createCryptoSession(db, clock);
    s.unlock(umk);
    expect(await s.stayStatus()).toBeNull();
    await s.stayUnlocked(3);
    expect(await s.stayStatus()).toEqual({ expiresAt: now + 3 * DAY });

    now += 3 * DAY - 1;
    expect(await createCryptoSession(db, clock).restore()).toBe(true);
    now += 1;
    expect(await createCryptoSession(db, clock).restore()).toBe(false);
    expect(await s.stayStatus()).toBeNull();

    await s.stayUnlocked(30);
    await s.forgetDevice(); // Widerruf
    expect(await s.stayStatus()).toBeNull();
    expect(await createCryptoSession(db, clock).restore()).toBe(false);
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
