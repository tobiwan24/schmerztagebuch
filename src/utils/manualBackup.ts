// src/utils/manualBackup.ts
// Vollständiges Export/Import-System für manuelles Backup als JSON-Datei

import db from '../db';
import type { Template, Entry, Settings } from '../types/database';

export interface BackupData {
  version: number;
  exportedAt: string;
  templates: Template[];
  entries: Entry[];
  settings: Settings[];
}

export async function exportBackup(): Promise<void> {
  const [templates, entries, settings] = await Promise.all([
    db.templates.toArray(),
    db.entries.toArray(),
    db.settings.toArray()
  ]);

  const data: BackupData = {
    version: db.verno,
    exportedAt: new Date().toISOString(),
    templates,
    entries,
    settings
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `schmerztagebuch_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function getBackupStats(): Promise<{ templates: number; entries: number; total: number }> {
  const [templates, entries] = await Promise.all([
    db.templates.count(),
    db.entries.count()
  ]);
  return { templates, entries, total: templates + entries };
}

function validateBackup(data: unknown): data is BackupData {
  return (
    typeof data === 'object' && data !== null &&
    typeof (data as BackupData).version === 'number' &&
    typeof (data as BackupData).exportedAt === 'string' &&
    Array.isArray((data as BackupData).templates) &&
    Array.isArray((data as BackupData).entries) &&
    Array.isArray((data as BackupData).settings)
  );
}

export type ImportMode = 'overwrite' | 'merge';

export async function peekBackup(file: File): Promise<{
  valid: boolean;
  message?: string;
  stats?: { templates: number; entries: number; exportedAt: string };
}> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!validateBackup(data)) return { valid: false, message: 'Ungültiges Backup-Format' };
    if (data.version > db.verno) {
      return { valid: false, message: `Backup ist von einer neueren App-Version (v${data.version}). Bitte aktualisiere die App.` };
    }
    return {
      valid: true,
      stats: {
        templates: data.templates.length,
        entries: data.entries.length,
        exportedAt: data.exportedAt,
      }
    };
  } catch {
    return { valid: false, message: 'Ungültige JSON-Datei' };
  }
}

export async function importBackup(file: File, mode: ImportMode = 'overwrite'): Promise<{
  success: boolean;
  message: string;
  stats?: { templates: number; entries: number; settings: number };
}> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!validateBackup(data)) {
      return { success: false, message: 'Ungültiges Backup-Format' };
    }

    if (data.version > db.verno) {
      return {
        success: false,
        message: `Backup ist von einer neueren App-Version (v${data.version}). Bitte aktualisiere die App.`
      };
    }

    await db.transaction('rw', db.templates, db.entries, db.settings, async () => {
      if (mode === 'overwrite') {
        // Alles löschen, dann Backup einspielen
        await db.templates.clear();
        await db.entries.clear();
        await db.settings.clear();
        if (data.templates.length) await db.templates.bulkPut(data.templates);
        if (data.entries.length) await db.entries.bulkPut(data.entries);
        if (data.settings.length) await db.settings.bulkPut(data.settings);
      } else {
        // Merge: nur IDs einfügen die noch nicht existieren
        if (data.templates.length) {
          const existingIds = new Set(await db.templates.toCollection().primaryKeys());
          const newTemplates = data.templates.filter(t => !existingIds.has(t.id));
          if (newTemplates.length) await db.templates.bulkAdd(newTemplates);
        }
        if (data.entries.length) {
          const existingIds = new Set(await db.entries.toCollection().primaryKeys());
          const newEntries = data.entries.filter(e => !existingIds.has(e.id));
          if (newEntries.length) await db.entries.bulkAdd(newEntries);
        }
        // Settings immer überschreiben (kleine Tabelle, kein Konflikt-Risiko)
        if (data.settings.length) await db.settings.bulkPut(data.settings);
      }
    });

    return {
      success: true,
      message: 'Backup erfolgreich wiederhergestellt',
      stats: {
        templates: data.templates.length,
        entries: data.entries.length,
        settings: data.settings.length
      }
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, message: 'Ungültige JSON-Datei' };
    }
    return { success: false, message: 'Import fehlgeschlagen: ' + (error as Error).message };
  }
}
