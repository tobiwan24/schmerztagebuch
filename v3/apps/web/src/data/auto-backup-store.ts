// Ablage der Auto-Sicherung (EXP-17): eigene IndexedDB `stb-v3-autobackup`, getrennt von `stb-v3`. Bewusst ohne Export-Code,
// damit Einstellungen und Start sie ohne das große Export-Paket laden können (QA-02).
import { Dexie, type EntityTable } from 'dexie';
import type { UmkWrap } from '@stb/crypto';

export const AUTO_BACKUP_DB = 'stb-v3-autobackup';
export const AUTO_BACKUP_MIN_INTERVAL_MS = 86_400_000;

export interface AutoBackupRecord {
  id: 'latest';
  v: 1;
  createdAt: string;
  /** Kopie der Faktor-Wraps der UMK zum Zeitpunkt der Sicherung. */
  wraps: UmkWrap[];
  /** Sicherungsschlüssel, mit der UMK (AES-GCM) verpackt. */
  keyBox: { iv: string; ct: string };
  /** Dateiinhalt im Format `.stbbackup`. */
  file: string;
}

export class AutoBackupDb extends Dexie {
  backups!: EntityTable<AutoBackupRecord, 'id'>;
  constructor(name = AUTO_BACKUP_DB) {
    super(name);
    this.version(1).stores({ backups: 'id' });
  }
}

export async function autoBackupInfo(store: AutoBackupDb): Promise<{ createdAt: string } | null> {
  const rec = await store.backups.get('latest');
  return rec ? { createdAt: rec.createdAt } : null;
}

/**
 * Nach einer Änderung der Faktoren (Passwort, Passkey, Backup-Code): Kopie der UMK-Wraps in der Sicherung aktualisieren, damit
 * ein ersetzter Faktor die Sicherung nicht mehr öffnet. Ohne vorhandene Sicherung passiert nichts (legt keine Datenbank an).
 */
export async function refreshAutoBackupWraps(wraps: UmkWrap[]): Promise<void> {
  if (!(await Dexie.exists(AUTO_BACKUP_DB))) return;
  const store = new AutoBackupDb();
  try {
    await store.backups.where('id').equals('latest').modify({ wraps });
  } finally {
    store.close();
  }
}
