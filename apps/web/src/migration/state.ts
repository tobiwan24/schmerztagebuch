// Migrationszustand und Bericht (Spec 11, Schritt 8) — eigenes Modul ohne Transformations-/Export-Code, damit
// Start-Hinweis und Einstellungen klein bleiben (QA-02).
import type { MigrationReport } from '@stb/core';
import type { StbDb } from '@/data/db';

export interface VerifyResult {
  ok: boolean;
  checkedEntries: number;
  sampled: number;
  errors: string[];
}

const STATE_KEY = 'migration-v2';

export interface MigrationState {
  /** Zeitpunkt der letzten erfolgreichen Prüfung (Spec: `migratedFromV2At`). */
  migratedFromV2At?: string;
  lastRunAt: string;
  report: MigrationReport;
  verify: VerifyResult;
  /** v2-Daten auf diesem Gerät entfernt. */
  v2RemovedAt?: string;
}

export async function saveMigrationState(db: StbDb, state: MigrationState): Promise<void> {
  await db.device.put({ id: STATE_KEY, value: state });
}

export async function loadMigrationState(db: StbDb): Promise<MigrationState | undefined> {
  return (await db.device.get(STATE_KEY))?.value as MigrationState | undefined;
}

/** Bericht als lesbare Textdatei (Spec 11: „Bericht wird als Datei angeboten"). */
export function reportText(state: MigrationState): string {
  const r = state.report;
  const lines = [
    'Schmerztagebuch — Migrationsbericht v2 → v3',
    `Lauf: ${state.lastRunAt}`,
    `Prüfung: ${state.verify.ok ? 'erfolgreich' : 'FEHLER'} (${state.verify.checkedEntries} Einträge geprüft, ${state.verify.sampled} im Detail)`,
    '',
    `Vorlagen: ${r.counts.templates} (Versionen: ${r.counts.templateVersions})`,
    `Einträge: ${r.counts.entries}`,
    `Anhänge: ${r.counts.attachments}`,
    `Eigene Körperkarten-Bilder: ${r.counts.bodymapImages}`,
    `Übersprungen (gelöscht): ${r.counts.skippedDeleted}`,
    `Nicht übernommen: ${r.counts.undecryptable}`,
    ...r.undecryptable.map((u) => `  - ${u.date.slice(0, 10)} (v2-ID ${u.v2Id}): ${u.reason}`),
    `Unbekannte Werte: ${r.unknownValues.length}`,
    ...r.unknownValues.map((u) => `  - ${u.date} „${u.template}“ / „${u.block}“: ${u.value}`),
    `Hinweise: ${r.warnings.length}`,
    ...r.warnings.map((w) => `  - ${w}`),
    ...(state.verify.errors.length ? ['', 'Prüffehler:', ...state.verify.errors.map((e) => `  - ${e}`)] : []),
    '',
    'Zuordnung v2-Block → v3-Block:',
    ...Object.entries(r.blockMap).map(([k, v]) => `  ${k} → ${v}`),
  ];
  return lines.join('\n') + '\n';
}
