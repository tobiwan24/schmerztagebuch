// Wiederherstellung aus der Auto-Sicherung (EXP-16/EXP-17). Lazy geladen — zieht Export und Backup-Datei mit.
import { Dexie } from 'dexie';
import type { UmkFactor } from '@stb/crypto';
import { AUTO_BACKUP_DB, AutoBackupDb, autoBackupInfo } from './auto-backup-store';
import { readAutoBackup } from './auto-backup';
import { applyImport, planImport } from './import-export';
import type { DataApi } from './DataContext';

/** Zeitpunkt der Auto-Sicherung, `null` ohne. Legt keine leere Datenbank an. */
export async function autoBackupCreatedAt(): Promise<string | null> {
  if (!(await Dexie.exists(AUTO_BACKUP_DB))) return null;
  const store = new AutoBackupDb();
  try {
    return (await autoBackupInfo(store))?.createdAt ?? null;
  } finally {
    store.close();
  }
}

/** Entschlüsselt die Auto-Sicherung mit einem Faktor und führt sie in die lokalen Daten ein. Gibt die Zahl der Einträge zurück. */
export async function restoreFromAutoBackup(data: Pick<DataApi, 'records' | 'attachments' | 'newId'>, factor: UmkFactor): Promise<number> {
  const store = new AutoBackupDb();
  try {
    const doc = await readAutoBackup(store, factor);
    const plan = await planImport(data.records, doc, { newId: data.newId });
    await applyImport(data.records, plan, data.attachments);
    return plan.entries;
  } finally {
    store.close();
  }
}
