// Quelle 3 (Spec 11): v2-Backup-Datei im `manualBackup`-Format (v2 `src/utils/manualBackup.ts`, gleich auf
// `fix/v2-backup-merge`): `{ version, exportedAt, templates, entries, settings }` — die Zeilen wie in der PainDiaryDB,
// Zeitstempel als ISO-Text. Ergibt denselben Schnappschuss wie das Lesen der lokalen DB (MIG-12).
import type { V2Template } from '@stb/core';
import type { V2EntryRow, V2Snapshot } from './source';

export class V2BackupError extends Error {
  constructor(readonly code: 'not-json' | 'wrong-format' | 'newer-version', message: string) {
    super(message);
    this.name = 'V2BackupError';
  }
}

/** Höchste v2-Schema-Version, die v3 kennt. */
export const V2_MAX_SCHEMA = 21;

export function parseV2Backup(text: string): V2Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new V2BackupError('not-json', 'Keine JSON-Datei');
  }
  const d = raw as { version?: unknown; exportedAt?: unknown; templates?: unknown; entries?: unknown; settings?: unknown } | null;
  if (!d || typeof d !== 'object' || typeof d.version !== 'number' || typeof d.exportedAt !== 'string' || !Array.isArray(d.templates) || !Array.isArray(d.entries) || !Array.isArray(d.settings)) {
    throw new V2BackupError('wrong-format', 'Keine v2-Backup-Datei');
  }
  if (d.version > V2_MAX_SCHEMA) throw new V2BackupError('newer-version', `v2-Backup aus einer neueren Version (${d.version})`);
  const entries = (d.entries as Record<string, unknown>[]).map((e) => {
    const t = new Date(e.timestamp as string);
    return { ...e, timestamp: Number.isNaN(t.getTime()) ? String(e.timestamp) : t.toISOString() } as V2EntryRow;
  });
  const settings = Object.fromEntries((d.settings as { key: string; value: string }[]).filter((s) => typeof s?.key === 'string').map((s) => [s.key, s.value])) as V2Snapshot['settings'];
  return { idbVersion: d.version * 10, templates: d.templates as V2Template[], entries, settings };
}
