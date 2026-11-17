// Export und Import in der Web-Datenschicht (Spec 07). Import ist idempotent: bekannte IDs werden nach den Merge-Regeln
// (Spec 04, ganzer Datensatz) zusammengeführt — neuer HLC bzw. `updatedAt` gewinnt, gleiche Inhalte werden übersprungen.
// Alles wird vorab geprüft und dann in **einer** Transaktion geschrieben; bei Fehlern bleibt die DB unverändert (EXP-11).
import { canonical, compareHlc, decodeDataUrl, encodeDataUrl, entrySchemaFor } from '@stb/core';
import { openBackupFile, sealBackupFile, type BackupSecret } from '@stb/crypto';
import { buildExport, copyWithNewIds, exportRecords, ImportError, parseExport, type ExportSource, type ExportV1 } from '@stb/export';
import type { FilterSpec } from '@stb/analysis';
import type { RecordInput, RecordRepository } from './repositories/records';
import { templateVersionRecordId, type DiaryRepository } from './repositories/diary';
import { ATTACHMENT_KIND, type AttachmentInput, type AttachmentRepository } from './repositories/attachments';

export async function collectExportSource(diary: DiaryRepository, attachments?: AttachmentRepository): Promise<ExportSource> {
  const diaries = await diary.listDiaries();
  const [templates, versions, entries] = await Promise.all([diary.listAllTemplates(), diary.listAllTemplateVersions(), diary.listAllEntries()]);
  const savedFilters = (await Promise.all(diaries.map((d) => diary.listSavedFilters(d.id)))).flat();
  const bodymapImages = (await Promise.all(diaries.map((d) => diary.listBodymapImages(d.id)))).flat();
  const dashboards = (await Promise.all(diaries.map((d) => diary.listDashboards(d.id)))).flat();
  const notificationRules = (await Promise.all(diaries.map((d) => diary.listNotificationRules(d.id)))).flat();
  // Anhänge nur mit lokal vorhandenem Inhalt (auf anderen Geräten ggf. noch nicht geladen)
  const withData = attachments
    ? (await Promise.all((await attachments.listAll()).map(async (m) => {
        const bytes = await attachments.data(m.id);
        return bytes ? { ...m, dataUrl: encodeDataUrl(m.mime, bytes) } : undefined;
      }))).filter((a): a is NonNullable<typeof a> => !!a)
    : [];
  return { diaries, templates, versions, entries, savedFilters, bodymapImages, notificationRules, dashboards, attachments: withData };
}

export async function createExport(diary: DiaryRepository, opts: { appVersion: string; now: number; filter?: FilterSpec }, attachments?: AttachmentRepository): Promise<ExportV1> {
  return buildExport(await collectExportSource(diary, attachments), opts);
}

/** `.stbbackup` (Spec 07): vollständiger JSON-v1-Export, verschlüsselt mit Backup-Code oder Backup-Passwort. */
export async function createBackupFile(diary: DiaryRepository, secret: BackupSecret, opts: { appVersion: string; now: number }, attachments?: AttachmentRepository): Promise<string> {
  const doc = await createExport(diary, opts, attachments);
  return sealBackupFile(JSON.stringify(doc), secret, doc.exportedAt);
}

/** Öffnet und prüft eine Backup-Datei (falsches Geheimnis → `wrong-backup-code`/`wrong-password`). */
export async function openBackup(file: string, secret: BackupSecret): Promise<ExportV1> {
  return parseExport(await openBackupFile(file, secret));
}

export interface ImportPlan {
  diaries: number;
  templates: number;
  entries: number;
  added: number;
  updated: number;
  unchanged: number;
  /** Zu schreibende Datensätze (intern). */
  writes: RecordInput[];
  /** Anhang-Inhalte zu neuen oder geänderten Anhang-Metadaten (intern). */
  blobs: AttachmentInput[];
}

type Stamp = { hlc?: string; updatedAt?: string };
/** Gewinnt der eingehende Stand? HLC vor `updatedAt` (Spec 04). Ohne Stempel bleibt der vorhandene Stand. */
function incomingWins(existing: unknown, incoming: unknown): boolean {
  const a = existing as Stamp;
  const b = incoming as Stamp;
  if (a.hlc && b.hlc) return compareHlc(b.hlc, a.hlc) > 0;
  if (a.updatedAt && b.updatedAt) return Date.parse(b.updatedAt) > Date.parse(a.updatedAt);
  return false;
}

/**
 * Vergleicht geplante Datensätze mit dem Bestand (ohne zu schreiben): neu → schreiben, gleicher Inhalt → überspringen,
 * sonst gewinnt der neuere Stand (HLC vor `updatedAt`); Vorlagenversionen sind unveränderlich. Gemeinsam für Import und
 * Migration (beide idempotent, EXP-03/MIG-09).
 */
export async function planRecordWrites(records: RecordRepository, inputs: readonly RecordInput[]): Promise<{ writes: RecordInput[]; added: number; updated: number; unchanged: number }> {
  const writes: RecordInput[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const rec of inputs) {
    const existing = await records.get(rec.id);
    if (!existing || existing.deleted) {
      writes.push(rec);
      added++;
    } else if (existing.kind !== rec.kind) {
      throw new ImportError('inconsistent', [`ID ${rec.id} gehört lokal zu „${existing.kind}“, in der Datei zu „${rec.kind}“`]);
    } else if (canonical(existing.payload) === canonical(rec.payload)) {
      unchanged++;
    } else if (rec.kind !== 'templateVersion' && incomingWins(existing.payload, rec.payload)) {
      writes.push(rec);
      updated++;
    } else {
      unchanged++; // vorhandener Stand ist neuer (oder Vorlagenversion — unveränderlich)
    }
  }
  return { writes, added, updated, unchanged };
}

/** Prüft und vergleicht mit dem Bestand (ohne zu schreiben) — Grundlage der Vorschau. */
export async function planImport(records: RecordRepository, input: ExportV1, opts: { asCopy?: boolean; newId: () => string }): Promise<ImportPlan> {
  const doc = opts.asCopy ? copyWithNewIds(input, opts.newId) : input;
  const inputs: RecordInput[] = [];
  const blobOf = new Map<string, AttachmentInput>();
  let templates = 0;
  let entries = 0;
  for (const d of doc.diaries) {
    const r = exportRecords(d);
    const versionOf = new Map(r.versions.map((v) => [`${v.templateId}#${v.version}`, v]));
    // Einträge gegen ihre Vorlagenversion prüfen (DM-03) — vor jedem Schreiben
    for (const e of r.entries) {
      const v = versionOf.get(`${e.templateId}#${e.templateVersion}`)!;
      const ok = entrySchemaFor(v).safeParse(e);
      if (!ok.success) throw new ImportError('invalid', ok.error.issues.slice(0, 3).map((i) => `Eintrag ${e.id}: ${i.path.join('.')}: ${i.message}`));
    }
    inputs.push({ id: r.diary.id, diaryId: r.diary.id, kind: 'diary', payload: r.diary });
    for (const t of r.templates) inputs.push({ id: t.id, diaryId: r.diary.id, kind: 'template', payload: t });
    for (const v of r.versions) inputs.push({ id: templateVersionRecordId(v.templateId, v.version), diaryId: r.diary.id, kind: 'templateVersion', payload: v });
    for (const e of r.entries) inputs.push({ id: e.id, diaryId: r.diary.id, kind: 'entry', payload: e, occurredAt: e.occurredAt });
    for (const f of r.savedFilters) inputs.push({ id: f.id, diaryId: r.diary.id, kind: 'savedFilter', payload: f });
    for (const i of r.bodymapImages) inputs.push({ id: i.id, diaryId: r.diary.id, kind: 'bodymapImage', payload: i });
    for (const x of r.dashboards) inputs.push({ id: x.id, diaryId: r.diary.id, kind: 'dashboard', payload: x });
    for (const n of r.notificationRules) inputs.push({ id: n.id, diaryId: r.diary.id, kind: 'notificationRule', payload: n });
    for (const a of r.attachments) {
      const { dataUrl, ...meta } = a;
      const decoded = decodeDataUrl(dataUrl);
      if (!decoded) throw new ImportError('invalid', [`Anhang ${a.id}: Inhalt unlesbar`]);
      inputs.push({ id: a.id, diaryId: r.diary.id, kind: ATTACHMENT_KIND, payload: meta });
      blobOf.set(a.id, { meta, bytes: decoded.bytes });
    }
    templates += r.templates.length;
    entries += r.entries.length;
  }

  const { writes, added, updated, unchanged } = await planRecordWrites(records, inputs);
  const blobs = writes.filter((w) => w.kind === ATTACHMENT_KIND).map((w) => blobOf.get(w.id)!);
  return { diaries: doc.diaries.length, templates, entries, added, updated, unchanged, writes, blobs };
}

/**
 * Führt einen geprüften Plan aus: Anhang-Inhalte zuerst (Blob-Store + Upload-Warteschlange), dann alle Datensätze in
 * **einer** Transaktion. Ein Abbruch dazwischen hinterlässt höchstens verwaiste Blobs, nie Metadaten ohne Inhalt.
 */
export async function applyImport(records: RecordRepository, plan: ImportPlan, attachments?: AttachmentRepository): Promise<void> {
  if (plan.blobs.length) {
    if (!attachments) throw new Error('Anhänge im Import, aber kein Anhang-Speicher');
    await attachments.saveBlobs(plan.blobs);
  }
  if (plan.writes.length) await records.putMany(plan.writes);
}
