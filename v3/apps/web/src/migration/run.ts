// Migration v2 → v3, Schritte 5–8 (Spec 11): Trockenlauf (Plan ohne Schreiben), Schreiben über die Repositories
// (Outbox → Sync), Prüfen (Anzahl + alle Werte jedes 10. Eintrags), Bericht + Abschluss-Flag. Idempotent über die
// deterministischen IDs der Transformation und den Vergleich mit dem Bestand (MIG-09).
import { canonical, compareHlc, decodeDataUrl, type MigrationResult } from '@stb/core';
import type { RecordInput, RecordRepository } from '@/data/repositories/records';
import { templateVersionRecordId, type DiaryRepository } from '@/data/repositories/diary';
import { ATTACHMENT_KIND, type AttachmentInput, type AttachmentRepository } from '@/data/repositories/attachments';
import { planRecordWrites } from '@/data/import-export';

export interface MigrationPlan {
  result: MigrationResult;
  added: number;
  updated: number;
  unchanged: number;
  /** Intern: zu schreibende Datensätze und Anhang-Inhalte. */
  writes: RecordInput[];
  blobs: AttachmentInput[];
}

/** Schritt 5 — Trockenlauf: vergleicht mit dem Bestand, schreibt nichts (MIG-08). */
export async function planMigration(records: RecordRepository, result: MigrationResult): Promise<MigrationPlan> {
  const inputs: RecordInput[] = [];
  const blobOf = new Map<string, AttachmentInput>();
  for (const { template, versions } of result.templates) {
    inputs.push({ id: template.id, diaryId: template.diaryId, kind: 'template', payload: template });
    for (const v of versions) inputs.push({ id: templateVersionRecordId(v.templateId, v.version), diaryId: template.diaryId, kind: 'templateVersion', payload: v });
  }
  for (const img of result.bodymapImages) inputs.push({ id: img.id, diaryId: img.diaryId, kind: 'bodymapImage', payload: img });
  for (const e of result.entries) inputs.push({ id: e.id, diaryId: e.diaryId, kind: 'entry', payload: e, occurredAt: e.occurredAt });
  for (const a of result.attachments) {
    const { dataUrl, ...meta } = a;
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) continue; // Transformation liefert nur lesbare Data-URLs
    inputs.push({ id: a.id, diaryId: a.diaryId, kind: ATTACHMENT_KIND, payload: meta });
    blobOf.set(a.id, { meta, bytes: decoded.bytes });
  }
  const { writes, added, updated, unchanged } = await planRecordWrites(records, inputs);
  const blobs = writes.filter((w) => w.kind === ATTACHMENT_KIND).map((w) => blobOf.get(w.id)!);
  return { result, added, updated, unchanged, writes, blobs };
}

/** Schritt 6 — Schreiben: Anhang-Inhalte zuerst, dann alle Datensätze in einer Transaktion. */
export async function applyMigration(records: RecordRepository, attachments: AttachmentRepository, plan: MigrationPlan): Promise<void> {
  await attachments.saveBlobs(plan.blobs);
  if (plan.writes.length) await records.putMany(plan.writes);
}

import type { VerifyResult } from './state';
export type { VerifyResult } from './state';

/**
 * Schritt 7 — Prüfen: jeder erwartete Eintrag, jede Vorlage und jeder Anhang existiert in v3; für jeden 10. Eintrag
 * (stabil nach ID sortiert) stimmen alle Werte überein. Abweichungen sind Fehler (MIG-10).
 */
export async function verifyMigration(diary: DiaryRepository, attachments: AttachmentRepository, result: MigrationResult): Promise<VerifyResult> {
  const errors: string[] = [];
  for (const { template, versions } of result.templates) {
    if (!(await diary.getTemplate(template.id))) errors.push(`Vorlage „${template.name}“ fehlt`);
    for (const v of versions) if (!(await diary.getTemplateVersion(v.templateId, v.version))) errors.push(`Vorlage „${template.name}“: Version ${v.version} fehlt`);
  }
  const expected = [...result.entries].sort((a, b) => (a.id < b.id ? -1 : 1));
  let sampled = 0;
  for (const [i, e] of expected.entries()) {
    const got = await diary.getEntry(e.id);
    if (!got) {
      errors.push(`Eintrag vom ${e.occurredAt.slice(0, 10)} fehlt`);
      continue;
    }
    if (i % 10 === 0) {
      sampled++;
      if (canonical(got.values) !== canonical(e.values) || got.occurredAt !== e.occurredAt || canonical(got.period ?? null) !== canonical(e.period ?? null)) {
        // In v3 nachträglich geänderte Einträge (neuerer HLC) sind keine Abweichung der Migration
        if (compareHlc(got.hlc, e.hlc) <= 0) errors.push(`Eintrag vom ${e.occurredAt.slice(0, 10)}: Werte weichen ab`);
      }
    }
  }
  for (const a of result.attachments) {
    if (!(await attachments.get(a.id))) errors.push(`Anhang „${a.name}“ fehlt`);
    else if (!(await attachments.data(a.id))) errors.push(`Anhang „${a.name}“: Inhalt fehlt`);
  }
  return { ok: errors.length === 0, checkedEntries: expected.length, sampled, errors };
}

export { saveMigrationState, loadMigrationState, reportText, type MigrationState } from './state';
