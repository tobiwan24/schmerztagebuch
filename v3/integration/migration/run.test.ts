// Migration v2 → v3 Ende-zu-Ende in der Datenschicht (Spec 11, Schritte 1–8): PainDiaryDB → entschlüsseln → transformieren
// → Trockenlauf → schreiben → prüfen. Läuft gegen fake-indexeddb mit dem echten v2-Schema.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildV2Dump, createDiary, createIdGenerator, transformV2, V2_OWN_IMAGE, V2_PRESET_IMAGE, type MigrationOptions } from '@stb/core';
import { StbDb } from '../../apps/web/src/data/db.js';
import { plainCodec } from '../../apps/web/src/data/codec/plain.js';
import { createCodecRegistry } from '../../apps/web/src/data/codec/registry.js';
import { createRecordRepository } from '../../apps/web/src/data/repositories/records.js';
import { createDiaryRepository } from '../../apps/web/src/data/repositories/diary.js';
import { createAttachmentRepository } from '../../apps/web/src/data/repositories/attachments.js';
import { readV2Snapshot, V2_DB_NAME } from '../../apps/web/src/migration/v2/source.js';
import { decodeV2Snapshot } from '../../apps/web/src/migration/v2/decode.js';
import { applyMigration, planMigration, verifyMigration } from '../../apps/web/src/migration/run.js';
import { createV2Database } from './v2-db.js';

let n = 0;
const dbs: StbDb[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(V2_DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
});

async function setup() {
  await createV2Database(buildV2Dump());
  const db = new StbDb(`stb-v3-mig-${++n}`);
  await db.open();
  dbs.push(db);
  let t = 1_900_000_000_000;
  const clock = { now: () => (t += 1000) };
  const records = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: true });
  const diary = createDiaryRepository(records);
  const attachments = createAttachmentRepository(db, records, clock);
  const { newId } = createIdGenerator(clock);
  const target = createDiary({ id: newId(), name: 'Ich', subject: 'human', timezone: 'Europe/Berlin' }, clock);
  await diary.createDiary(target);
  const opts: MigrationOptions = {
    diaryId: target.id,
    authorId: 'user-1',
    timezone: 'Europe/Berlin',
    resolveImage: (img, hint) => (img === V2_PRESET_IMAGE ? { presetId: hint.defaultPresetId ?? 'default-koerper-vorderseite' } : img === V2_OWN_IMAGE ? { width: 600, height: 800 } : null),
  };
  const transform = async () => transformV2(await decodeV2Snapshot((await readV2Snapshot())!, {}), opts);
  return { db, records, diary, attachments, transform, target };
}

const snapshotOf = async (db: StbDb) => ({ records: await db.records.toArray(), outbox: await db.outbox.toArray(), blobs: await db.blobs.toArray(), blobOutbox: await db.blob_outbox.toArray() });

describe('Migration schreiben und prüfen', () => {
  it('MIG-08: der Trockenlauf schreibt nichts in stb-v3', async () => {
    const s = await setup();
    const before = await snapshotOf(s.db);
    const plan = await planMigration(s.records, await s.transform());
    expect(plan).toMatchObject({ added: 4 + 5 + 1 + 8 + 3, updated: 0, unchanged: 0 });
    expect(await snapshotOf(s.db)).toEqual(before);
  });

  it('MIG-09: ein zweiter Lauf erzeugt keine Duplikate (deterministische IDs)', async () => {
    const s = await setup();
    await applyMigration(s.records, s.attachments, await planMigration(s.records, await s.transform()));
    const after1 = await snapshotOf(s.db);
    expect((await s.diary.listAllEntries()).length).toBe(8);

    const second = await planMigration(s.records, await s.transform());
    expect(second).toMatchObject({ added: 0, updated: 0, writes: [], blobs: [] });
    await applyMigration(s.records, s.attachments, second);
    expect(await snapshotOf(s.db)).toEqual(after1);
    expect((await s.diary.listAllEntries()).length).toBe(8);
    expect((await s.diary.listAllTemplates()).length).toBe(4);
  });

  it('MIG-10: der Prüfschritt meldet einen fehlenden Eintrag als Fehler', async () => {
    const s = await setup();
    const result = await s.transform();
    await applyMigration(s.records, s.attachments, await planMigration(s.records, result));
    const ok = await verifyMigration(s.diary, s.attachments, result);
    expect(ok).toMatchObject({ ok: true, checkedEntries: 8, errors: [] });
    expect(ok.sampled).toBeGreaterThan(0);

    // absichtliche Abweichung: ein Eintrag fehlt in v3, ein Anhang-Inhalt fehlt
    const victim = result.entries[3]!;
    await s.db.records.delete(victim.id);
    await s.db.blobs.delete(result.attachments[0]!.id);
    const bad = await verifyMigration(s.diary, s.attachments, result);
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain(`Eintrag vom ${victim.occurredAt.slice(0, 10)} fehlt`);
    expect(bad.errors).toContain(`Anhang „${result.attachments[0]!.name}“: Inhalt fehlt`);
  });

  it('MIG-13: nicht entschlüsselbare Einträge stehen mit Datum im Bericht und blockieren die übrigen nicht', async () => {
    const s = await setup();
    const result = await s.transform();
    expect(result.report.undecryptable).toEqual([{ v2Id: 10, date: '2026-01-15T08:00:00.000Z', reason: 'v2-Passwort fehlt' }]);
    await applyMigration(s.records, s.attachments, await planMigration(s.records, result));
    expect((await s.diary.listAllEntries()).length).toBe(8);
    expect((await verifyMigration(s.diary, s.attachments, result)).ok).toBe(true);
  });

  it('migrierte Einträge und Anhänge gehen in die Outbox bzw. Upload-Warteschlange (Sync zum v3-Server)', async () => {
    const s = await setup();
    const before = await s.db.outbox.count();
    await applyMigration(s.records, s.attachments, await planMigration(s.records, await s.transform()));
    expect((await s.db.outbox.count()) - before).toBe(4 + 5 + 1 + 8 + 3);
    expect(await s.db.blob_outbox.count()).toBe(3);
  });
});
