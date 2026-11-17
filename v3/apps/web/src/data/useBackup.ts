// Backup-Zugriffe für Ansichten (Komponenten greifen nie direkt auf die DB zu, Spec 01).
import { useCallback } from 'react';
import type { BackupSecret } from '@stb/crypto';
import type { FilterSpec } from '@stb/analysis';
import { buildReport, buildSummaryInput, exportCsvLong, exportCsvWide, renderReportPdf, type CsvProfile, type ExportV1, type PdfImageSize, type PdfLayout, type RenderedImage } from '@stb/export';
import { createBodymapRenderer } from '@/lib/pdf-bodymap';
import { renderChartImage } from '@/lib/pdf-chart';
import { useAuth } from '@/auth/AuthContext';
import { createReportLink } from '@/sharing/report-link';
import { encodeReportPackage } from '@/sharing/report-package';
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

  /** Berichtsmodell und PDF (gleiche Optionen wie der PDF-Export); Grundlage für Download und Arzt-Link. */
  const buildPdf = useCallback(
    async (opts: { filter?: FilterSpec; imageSize?: PdfImageSize; layout?: PdfLayout; multiselectBlockIds?: string[]; password?: string; summary?: string; dashboardImage?: RenderedImage }) => {
      const src = await collectExportSource(data.diary);
      const report = buildReport(src, { now: now(), ...(opts.filter ? { filter: opts.filter } : {}) });
      const renderBodymap = createBodymapRenderer(new Map(src.bodymapImages.map((i) => [i.id, i.dataUrl])));
      const bytes = await renderReportPdf(report, { imageSize: opts.imageSize ?? 'a5', layout: opts.layout ?? 'table', renderBodymap, renderChart: renderChartImage, ...(opts.dashboardImage ? { dashboardImage: opts.dashboardImage } : {}), multiselectBlockIds: opts.multiselectBlockIds ?? [], ...(opts.password ? { password: opts.password } : {}), ...(opts.summary?.trim() ? { summary: opts.summary } : {}) });
      return { report, bytes };
    },
    [data.diary, now],
  );

  /** Arzt-Link (M18): Berichtspaket (Modell + PDF ohne Passwort) verschlüsseln, hochladen, Link liefern. */
  const createDoctorLink = useCallback(
    async (opts: { filter?: FilterSpec; imageSize?: PdfImageSize; layout?: PdfLayout; multiselectBlockIds?: string[]; summary?: string; expiresInDays: number; maxViews: number }) => {
      const { expiresInDays, maxViews, ...pdfOpts } = opts;
      const { report, bytes } = await buildPdf(pdfOpts);
      return createReportLink({ origin: globalThis.location.origin, payload: encodeReportPackage(report, bytes), expiresInDays, maxViews });
    },
    [buildPdf],
  );

  const exportFile = useCallback(
    async (format: ExportFormat, opts: { profile?: CsvProfile; filter?: FilterSpec; imageSize?: PdfImageSize; layout?: PdfLayout; multiselectBlockIds?: string[]; password?: string; summary?: string; dashboardImage?: RenderedImage }): Promise<{ name: string; text: string | Uint8Array; mime: string }> => {
      const stamp = new Date(now()).toISOString().slice(0, 10);
      if (format === 'pdf') {
        const { bytes } = await buildPdf(opts);
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
    [buildPdf, data.diary, data.attachments, now],
  );

  /** Eingabe für die KI-Zusammenfassung (VOI-15): Kennzahlen des gewählten Umfangs, Notizen nur auf Wunsch. */
  const summaryInput = useCallback(
    async (opts: { filter?: FilterSpec; includeNotes: boolean }) => buildSummaryInput(await collectExportSource(data.diary), { now: now(), includeNotes: opts.includeNotes, ...(opts.filter ? { filter: opts.filter } : {}) }),
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

  return { state, exportFile, createDoctorLink, summaryInput, checkBackupCode, backupFile, readBackup, plan, apply, saveReminderDays };
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
  // Mobile Browser (iOS Safari) lesen die Blob-URL erst nach dem Antippen/Öffnen — zu frühes Freigeben liefert eine leere Datei.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
