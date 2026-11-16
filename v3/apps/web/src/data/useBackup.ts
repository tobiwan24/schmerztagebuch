// Backup-Zugriffe für Ansichten (Komponenten greifen nie direkt auf die DB zu, Spec 01).
import { useCallback } from 'react';
import type { BackupSecret } from '@stb/crypto';
import type { FilterSpec } from '@stb/analysis';
import { buildReport, exportCsvLong, exportCsvWide, renderReportPdf, type CsvProfile, type ExportV1, type PdfImageSize, type PdfLayout } from '@stb/export';
import { createBodymapRenderer } from '@/lib/pdf-bodymap';
import { renderChartImage } from '@/lib/pdf-chart';
import { useAuth } from '@/auth/AuthContext';
import { unlockLocal } from '@/auth/local-account';
import { APP_VERSION } from '@/version';
import { markBackupDone, setReminderDays } from './backup-state';
import { useBackupState } from './useBackupState';
import { applyImport, collectExportSource, createBackupFile, createExport, openBackup, planImport, type ImportPlan } from './import-export';
import { useData } from './DataContext';

export type ExportFormat = 'json' | 'csv-long' | 'csv-wide' | 'pdf';

export function useBackup() {
  const { db, now } = useAuth();
  const data = useData();
  const state = useBackupState();
  const query = state;

  const exportFile = useCallback(
    async (format: ExportFormat, opts: { profile?: CsvProfile; filter?: FilterSpec; imageSize?: PdfImageSize; layout?: PdfLayout; multiselectBlockIds?: string[]; password?: string }): Promise<{ name: string; text: string | Uint8Array; mime: string }> => {
      const stamp = new Date(now()).toISOString().slice(0, 10);
      if (format === 'pdf') {
        const src = await collectExportSource(data.diary);
        const report = buildReport(src, { now: now(), ...(opts.filter ? { filter: opts.filter } : {}) });
        const renderBodymap = createBodymapRenderer(new Map(src.bodymapImages.map((i) => [i.id, i.dataUrl])));
        const bytes = await renderReportPdf(report, { imageSize: opts.imageSize ?? 'a5', layout: opts.layout ?? 'table', renderBodymap, renderChart: renderChartImage, multiselectBlockIds: opts.multiselectBlockIds ?? [], ...(opts.password ? { password: opts.password } : {}) });
        return { name: `schmerztagebuch-bericht-${stamp}.pdf`, text: bytes, mime: 'application/pdf' };
      }
      if (format === 'json') {
        const doc = await createExport(data.diary, { appVersion: APP_VERSION, now: now(), ...(opts.filter ? { filter: opts.filter } : {}) }, data.attachments);
        return { name: `schmerztagebuch-${stamp}.stb.json`, text: JSON.stringify(doc, null, 2), mime: 'application/json' };
      }
      const src = await collectExportSource(data.diary);
      const csvOpts = { profile: opts.profile ?? 'standard', now: now(), ...(opts.filter ? { filter: opts.filter } : {}) };
      const text = format === 'csv-long' ? exportCsvLong(src, csvOpts) : exportCsvWide(src, csvOpts);
      return { name: `schmerztagebuch-${format}-${csvOpts.profile}-${stamp}.csv`, text, mime: 'text/csv;charset=utf-8' };
    },
    [data.diary, data.attachments, now],
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
    const text = await createBackupFile(data.diary, secret, { appVersion: APP_VERSION, now: now() }, data.attachments);
    await markBackupDone(db, now());
    query.retry();
    return { name: `schmerztagebuch-${new Date(now()).toISOString().slice(0, 10)}.stbbackup`, text };
  }, [data.diary, data.attachments, db, now, query]);

  const readBackup = useCallback((file: string, secret: BackupSecret): Promise<ExportV1> => openBackup(file, secret), []);
  const plan = useCallback((doc: ExportV1, asCopy: boolean) => planImport(data.records, doc, { asCopy, newId: data.newId }), [data.records, data.newId]);
  const apply = useCallback((p: ImportPlan) => applyImport(data.records, p, data.attachments), [data.records, data.attachments]);
  const saveReminderDays = useCallback(async (days: number) => {
    await setReminderDays(db, days);
    query.retry();
  }, [db, query]);

  return { state, exportFile, checkBackupCode, backupFile, readBackup, plan, apply, saveReminderDays };
}

/** Datei im Browser herunterladen. */
export function downloadText(name: string, text: string | Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([text as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
