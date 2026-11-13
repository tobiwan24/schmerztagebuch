// Backup-Zugriffe für Ansichten (Komponenten greifen nie direkt auf die DB zu, Spec 01).
import { useCallback } from 'react';
import type { BackupSecret } from '@stb/crypto';
import type { FilterSpec } from '@stb/analysis';
import { exportCsvLong, exportCsvWide, type CsvProfile, type ExportV1 } from '@stb/export';
import { useAuth } from '@/auth/AuthContext';
import { loadAccount, unlockLocal } from '@/auth/local-account';
import { APP_VERSION } from '@/version';
import { backupDue, lastBackupAt, markBackupDone, reminderDays, setReminderDays } from './backup-state';
import { applyImport, collectExportSource, createBackupFile, createExport, openBackup, planImport, type ImportPlan } from './import-export';
import { useData } from './DataContext';
import { useQuery } from './useQuery';

export type ExportFormat = 'json' | 'csv-long' | 'csv-wide';

export function useBackup() {
  const { db, accountMode, now } = useAuth();
  const data = useData();
  const state = useQuery(async () => {
    const [last, days, account] = await Promise.all([lastBackupAt(db), reminderDays(db), loadAccount(db)]);
    const createdAt = account ? Date.parse(account.createdAt) : null;
    return { last, days, due: backupDue({ mode: accountMode, lastBackup: last, accountCreatedAt: createdAt, days, now: now() }) };
  }, [db, accountMode]);

  const exportFile = useCallback(
    async (format: ExportFormat, opts: { profile?: CsvProfile; filter?: FilterSpec }): Promise<{ name: string; text: string; mime: string }> => {
      const stamp = new Date(now()).toISOString().slice(0, 10);
      if (format === 'json') {
        const doc = await createExport(data.diary, { appVersion: APP_VERSION, now: now(), ...(opts.filter ? { filter: opts.filter } : {}) });
        return { name: `schmerztagebuch-${stamp}.stb.json`, text: JSON.stringify(doc, null, 2), mime: 'application/json' };
      }
      const src = await collectExportSource(data.diary);
      const csvOpts = { profile: opts.profile ?? 'standard', now: now(), ...(opts.filter ? { filter: opts.filter } : {}) };
      const text = format === 'csv-long' ? exportCsvLong(src, csvOpts) : exportCsvWide(src, csvOpts);
      return { name: `schmerztagebuch-${format}-${csvOpts.profile}-${stamp}.csv`, text, mime: 'text/csv;charset=utf-8' };
    },
    [data.diary, now],
  );

  /** Backup-Code lokal prüfen (gegen den Backup-Wrap der UMK), bevor damit verschlüsselt wird. */
  const checkBackupCode = useCallback(async (code: string) => {
    try {
      await unlockLocal(db, { kind: 'backup', code });
      return true;
    } catch {
      return false;
    }
  }, [db]);

  const backupFile = useCallback(async (secret: BackupSecret) => {
    const text = await createBackupFile(data.diary, secret, { appVersion: APP_VERSION, now: now() });
    await markBackupDone(db, now());
    state.retry();
    return { name: `schmerztagebuch-${new Date(now()).toISOString().slice(0, 10)}.stbbackup`, text };
  }, [data.diary, db, now, state]);

  const readBackup = useCallback((file: string, secret: BackupSecret): Promise<ExportV1> => openBackup(file, secret), []);
  const plan = useCallback((doc: ExportV1, asCopy: boolean) => planImport(data.records, doc, { asCopy, newId: data.newId }), [data.records, data.newId]);
  const apply = useCallback((p: ImportPlan) => applyImport(data.records, p), [data.records]);
  const saveReminderDays = useCallback(async (days: number) => {
    await setReminderDays(db, days);
    state.retry();
  }, [db, state]);

  return { state, exportFile, checkBackupCode, backupFile, readBackup, plan, apply, saveReminderDays };
}

/** Datei im Browser herunterladen. */
export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
