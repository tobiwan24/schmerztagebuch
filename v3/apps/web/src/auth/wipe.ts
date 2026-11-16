// Gefahr-Zone (UI-21): alle lokalen v3-Daten dieses Geräts löschen. Bewusst nur `stb-v3` und die Auto-Sicherung
// `stb-v3-autobackup` — die v2-Datenbank `PainDiaryDB` wird nie angefasst (Spec 11, MIG-05).
import { AUTO_BACKUP_DB } from '@/data/auto-backup-store';
import type { StbDb } from '@/data/db';

export const WIPE_CONFIRM_WORD = 'LÖSCHEN';

function deleteIdb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`${name} ließ sich nicht löschen`));
    req.onblocked = () => resolve(); // Löschung läuft nach dem Schließen der anderen Verbindung weiter
  });
}

/** Sitzung beenden, dann `stb-v3` (inkl. Geräteschlüssel) und die Auto-Sicherung löschen. */
export async function wipeLocalData(db: StbDb, session: { lock(): void }): Promise<void> {
  session.lock();
  await db.delete();
  await deleteIdb(AUTO_BACKUP_DB);
}
