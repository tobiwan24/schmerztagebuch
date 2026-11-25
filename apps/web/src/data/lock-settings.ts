// Sperr-Einstellungen (Spec 03 „Sitzung", CRY-20): Sperre bei Inaktivität (Aus/5/15/30/60 Minuten, Standard 30).
// Geräteweit in `device` gespeichert. Ein gespeichertes `stayDays` früherer Versionen wird ignoriert (RDM-035).
import type { StbDb } from './db.js';

export const IDLE_MINUTES_OPTIONS = [0, 5, 15, 30, 60] as const;
export interface LockSettings {
  /** 0 = Aus. */
  idleMinutes: number;
}
export const DEFAULT_LOCK_SETTINGS: LockSettings = { idleMinutes: 30 };
const STORE_ID = 'lock-settings';

function normalize(s: Partial<LockSettings>): LockSettings {
  const idle = (IDLE_MINUTES_OPTIONS as readonly number[]).includes(s.idleMinutes as number) ? (s.idleMinutes as number) : DEFAULT_LOCK_SETTINGS.idleMinutes;
  return { idleMinutes: idle };
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
