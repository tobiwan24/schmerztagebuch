// Sperr-Einstellungen (Spec 03 „Sitzung", CRY-20): Dauer „entsperrt bleiben" (1–30 Tage, Standard 7) und Sperre bei
// Inaktivität (Aus/5/15/30/60 Minuten, Standard 30). Geräteweit in `device` gespeichert.
import type { StbDb } from './db.js';

export const IDLE_MINUTES_OPTIONS = [0, 5, 15, 30, 60] as const;
export interface LockSettings {
  stayDays: number;
  /** 0 = Aus. */
  idleMinutes: number;
}
export const DEFAULT_LOCK_SETTINGS: LockSettings = { stayDays: 7, idleMinutes: 30 };
const STORE_ID = 'lock-settings';

function normalize(s: Partial<LockSettings>): LockSettings {
  const days = typeof s.stayDays === 'number' && Number.isFinite(s.stayDays) ? Math.min(30, Math.max(1, Math.round(s.stayDays))) : DEFAULT_LOCK_SETTINGS.stayDays;
  const idle = (IDLE_MINUTES_OPTIONS as readonly number[]).includes(s.idleMinutes as number) ? (s.idleMinutes as number) : DEFAULT_LOCK_SETTINGS.idleMinutes;
  return { stayDays: days, idleMinutes: idle };
}

export async function loadLockSettings(db: StbDb): Promise<LockSettings> {
  return normalize((await db.device.get(STORE_ID))?.value as Partial<LockSettings> | undefined ?? {});
}

export async function saveLockSettings(db: StbDb, patch: Partial<LockSettings>): Promise<LockSettings> {
  const next = normalize({ ...(await loadLockSettings(db)), ...patch });
  await db.device.put({ id: STORE_ID, value: next });
  return next;
}

/** Inaktivitäts-Wächter: `touch()` bei Aktivität, `check(minuten)` regelmäßig; löst `onIdle` einmal je Überschreitung aus. */
export function createIdleMonitor(clock: { now(): number }, onIdle: () => void) {
  let last = clock.now();
  return {
    touch(): void {
      last = clock.now();
    },
    check(minutes: number): boolean {
      if (minutes <= 0 || clock.now() - last < minutes * 60_000) return false;
      last = clock.now();
      onIdle();
      return true;
    },
  };
}
