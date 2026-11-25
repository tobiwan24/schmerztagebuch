// Einstellung „Daten auf dem Gerät verschlüsseln“ (Spec 02, A-093, A-125): geräteweiter Zustand in `device`. Nach dem
// Einschalten bleibt sie fest an (kein Abschalten aes → plain); die Records werden im Hintergrund umgeschrieben
// (`migrateRecords`, fortsetzbar), neue Schreibvorgänge nutzen sofort den Codec `aes`.
import type { StbDb } from './db.js';

const STORE_ID = 'local-encryption';

export interface LocalEncryptionState {
  enabled: boolean;
  /** Beginn (ISO), gesetzt beim Einschalten. */
  enabledAt?: string;
  /** Ende der Umstellung (ISO): kein Record mehr mit Codec `plain`. */
  completedAt?: string;
}

export async function loadLocalEncryption(db: StbDb): Promise<LocalEncryptionState> {
  const v = (await db.device.get(STORE_ID))?.value as Partial<LocalEncryptionState> | undefined;
  return v?.enabled === true
    ? { enabled: true, ...(v.enabledAt ? { enabledAt: v.enabledAt } : {}), ...(v.completedAt ? { completedAt: v.completedAt } : {}) }
    : { enabled: false };
}

/** Schaltet ein (idempotent; ein bereits eingeschalteter Zustand bleibt unverändert). */
export async function enableLocalEncryption(db: StbDb, now: () => number): Promise<LocalEncryptionState> {
  const cur = await loadLocalEncryption(db);
  if (cur.enabled) return cur;
  const next: LocalEncryptionState = { enabled: true, enabledAt: new Date(now()).toISOString() };
  await db.device.put({ id: STORE_ID, value: next });
  return next;
}

/** Vermerkt das Ende der Umstellung (nur bei eingeschalteter Einstellung). */
export async function markLocalEncryptionComplete(db: StbDb, now: () => number): Promise<LocalEncryptionState> {
  const cur = await loadLocalEncryption(db);
  if (!cur.enabled || cur.completedAt) return cur;
  const next: LocalEncryptionState = { ...cur, completedAt: new Date(now()).toISOString() };
  await db.device.put({ id: STORE_ID, value: next });
  return next;
}
