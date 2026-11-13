// EXP-10: `.stbbackup` mit Backup-Code wiederherstellbar (auf leerem Gerät, ohne Konto); falscher Code → wrong-backup-code;
// die Datei enthält keine Klartext-Marker.
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { createIdGenerator } from '@stb/core';
import { generateBackupCode } from '@stb/crypto';
import { FIXTURE_EXPORT_NOW, buildExport, exportFixture } from '@stb/export';
import { StbDb } from '../../apps/web/src/data/db.js';
import { plainCodec } from '../../apps/web/src/data/codec/plain.js';
import { createCodecRegistry } from '../../apps/web/src/data/codec/registry.js';
import { createRecordRepository } from '../../apps/web/src/data/repositories/records.js';
import { createDiaryRepository } from '../../apps/web/src/data/repositories/diary.js';
import { applyImport, collectExportSource, createBackupFile, openBackup, planImport } from '../../apps/web/src/data/import-export.js';

let n = 0;
const dbs: StbDb[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
});

async function device() {
  const db = new StbDb(`stb-v3-backup-${++n}`);
  await db.open();
  dbs.push(db);
  let t = 1_900_000_000_000;
  const clock = { now: () => (t += 1000) };
  const records = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false });
  return { db, records, diary: createDiaryRepository(records), newId: createIdGenerator(clock).newId };
}

const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));

describe('Backup', () => {
  it('EXP-10: .stbbackup mit Backup-Code wiederherstellbar; falscher Code → wrong-backup-code; keine Klartext-Marker', async () => {
    const src = exportFixture();
    const a = await device();
    await applyImport(a.records, await planImport(a.records, buildExport(src, { appVersion: 't', now: FIXTURE_EXPORT_NOW }), { newId: a.newId }));
    const code = await generateBackupCode();
    const file = await createBackupFile(a.diary, { kind: 'backup-code', code }, { appVersion: '3.0.0-test', now: FIXTURE_EXPORT_NOW });

    for (const marker of ['Testtagebuch', 'Übelkeit', 'Neurologie', 'Knie links', 'SUMME', 'Migräne', 'Schmerz', src.entries[0]!.id]) expect(file).not.toContain(marker);
    expect(JSON.parse(file)).toMatchObject({ format: 'stb-backup', version: 1, secret: 'backup-code' });

    await expect(openBackup(file, { kind: 'backup-code', code: await generateBackupCode() })).rejects.toMatchObject({ code: 'wrong-backup-code' });

    // neues, leeres Gerät ohne Konto
    const b = await device();
    const doc = await openBackup(file, { kind: 'backup-code', code });
    await applyImport(b.records, await planImport(b.records, doc, { newId: b.newId }));
    const restored = await collectExportSource(b.diary);
    expect(restored.diaries).toEqual(src.diaries);
    expect(sortById(restored.entries)).toEqual(sortById(src.entries));
    expect(sortById(restored.templates)).toEqual(sortById(src.templates));
    expect(restored.bodymapImages).toEqual(src.bodymapImages);
    expect(restored.savedFilters).toEqual(src.savedFilters);
  });
});
