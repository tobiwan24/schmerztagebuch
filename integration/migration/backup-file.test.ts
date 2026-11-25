// Quelle 3: v2-Backup-Datei ergibt dasselbe Ergebnis wie die gleiche lokale DB (Spec 11, MIG-12).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildV2Dump, canonical, transformV2, type MigrationOptions } from '@stb/core';
import { readV2Snapshot, V2_DB_NAME } from '../../apps/web/src/migration/v2/source.js';
import { decodeV2Snapshot } from '../../apps/web/src/migration/v2/decode.js';
import { parseV2Backup, V2BackupError } from '../../apps/web/src/migration/v2/backup.js';
import { createV2Database } from './v2-db.js';

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(V2_DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
});

const opts: MigrationOptions = {
  diaryId: '01900000-0000-7000-8000-000000000001', authorId: 'u', timezone: 'Europe/Berlin',
  resolveImage: (img, h) => (img.startsWith('data:image/png') ? { width: 600, height: 800 } : { presetId: h.defaultPresetId ?? 'default-koerper-vorderseite' }),
};

describe('v2-Backup-Datei', () => {
  it('MIG-12: v2-Backup-Datei als Quelle ergibt dasselbe Ergebnis wie die gleiche lokale DB', async () => {
    const dump = buildV2Dump();
    await createV2Database(dump);
    const fromDb = transformV2(await decodeV2Snapshot((await readV2Snapshot())!, {}), opts);
    // Datei wie v2 `exportBackup`: Zeilen mit Date-Zeitstempeln, JSON.stringify(…, null, 2)
    const file = JSON.stringify(
      { version: 21, exportedAt: '2026-03-10T12:00:00.000Z', templates: dump.templates, entries: dump.entries.map((e) => ({ ...e, timestamp: new Date(e.timestamp) })), settings: dump.settings },
      null,
      2,
    );
    const fromFile = transformV2(await decodeV2Snapshot(parseV2Backup(file), {}), opts);
    expect(canonical(fromFile)).toBe(canonical(fromDb));
    expect(fromFile.report.counts.entries).toBe(8);
  });

  it('erkennt falsche Dateien mit verständlichem Code', () => {
    const code = (text: string) => {
      try {
        parseV2Backup(text);
        return 'ok';
      } catch (e) {
        return (e as V2BackupError).code;
      }
    };
    expect(code('{kaputt')).toBe('not-json');
    expect(code('{"format":"stb-export"}')).toBe('wrong-format');
    expect(code(JSON.stringify({ version: 30, exportedAt: 'x', templates: [], entries: [], settings: [] }))).toBe('newer-version');
  });
});
