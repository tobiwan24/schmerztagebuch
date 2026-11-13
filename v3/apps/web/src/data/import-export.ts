// Export und Import in der Web-Datenschicht (Spec 07). Import ist idempotent: bekannte IDs werden nach den Merge-Regeln
// (Spec 04, ganzer Datensatz) zusammengeführt — neuer HLC bzw. `updatedAt` gewinnt, gleiche Inhalte werden übersprungen.
// Alles wird vorab geprüft und dann in **einer** Transaktion geschrieben; bei Fehlern bleibt die DB unverändert (EXP-11).
import { canonical, compareHlc, entrySchemaFor } from '@stb/core';
import { openBackupFile, sealBackupFile, type BackupSecret } from '@stb/crypto';
import { buildExport, copyWithNewIds, exportRecords, ImportError, parseExport, type ExportSource, type ExportV1 } from '@stb/export';
import type { FilterSpec } from '@stb/analysis';
import type { RecordInput, RecordRepository } from './repositories/records';
import { templateVersionRecordId, type DiaryRepository } from './repositories/diary';

export async function collectExportSource(diary: DiaryRepository): Promise<ExportSource> {
  const diaries = await diary.listDiaries();
  const [templates, versions, entries] = await Promise.all([diary.listAllTemplates(), diary.listAllTemplateVersions(), diary.listAllEntries()]);
  const savedFilters = (await Promise.all(diaries.map((d) => diary.listSavedFilters(d.id)))).flat();
  const bodymapImages = (await Promise.all(diaries.map((d) => diary.listBodymapImages(d.id)))).flat();
  return { diaries, templates, versions, entries, savedFilters, bodymapImages };
}

export async function createExport(diary: DiaryRepository, opts: { appVersion: string; now: number; filter?: FilterSpec }): Promise<ExportV1> {
  return buildExport(await collectExportSource(diary), opts);
}

/** `.stbbackup` (Spec 07): vollständiger JSON-v1-Export, verschlüsselt mit Backup-Code oder Backup-Passwort. */
export async function createBackupFile(diary: DiaryRepository, secret: BackupSecret, opts: { appVersion: string; now: number }): Promise<string> {
  const doc = await createExport(diary, opts);
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

/** Prüft und vergleicht mit dem Bestand (ohne zu schreiben) — Grundlage der Vorschau. */
export async function planImport(records: RecordRepository, input: ExportV1, opts: { asCopy?: boolean; newId: () => string }): Promise<ImportPlan> {
  const doc = opts.asCopy ? copyWithNewIds(input, opts.newId) : input;
  const inputs: RecordInput[] = [];
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
    templates += r.templates.length;
    entries += r.entries.length;
  }

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
  return { diaries: doc.diaries.length, templates, entries, added, updated, unchanged, writes };
}

/** Führt einen geprüften Plan aus (eine Transaktion). */
export async function applyImport(records: RecordRepository, plan: ImportPlan): Promise<void> {
  if (plan.writes.length) await records.putMany(plan.writes);
}
