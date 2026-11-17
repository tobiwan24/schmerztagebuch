import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addWidget, createDashboard, createDiary, createIdGenerator, instantiateCatalogTemplate, keyBetween, type NotificationRule } from '@stb/core';
import { StbDb } from './db.js';
import { plainCodec } from './codec/plain.js';
import { createCodecRegistry } from './codec/registry.js';
import { createRecordRepository } from './repositories/records.js';
import { createDiaryRepository, type DiaryRepository } from './repositories/diary.js';
import { applyImport, createBackupFile, createExport, openBackup, planImport } from './import-export.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const { newId } = createIdGenerator(clock);

let db: StbDb;
let n = 0;
let repo: DiaryRepository;
let records: ReturnType<typeof createRecordRepository>;
beforeEach(async () => {
  n++;
  db = new StbDb(`stb-v3-exprules-${n}`);
  await db.open();
  records = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false });
  repo = createDiaryRepository(records);
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Hinweis-Regeln in Export und Sicherung', () => {
  it('JSON-Export und verschlüsseltes Backup enthalten Regeln; Import stellt sie wieder her (Roundtrip)', async () => {
    const diary = createDiary({ id: newId(), name: 'Mein Tagebuch', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    const tpl = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId: diary.id, order: keyBetween(null, null), newId }, clock);
    await repo.createDiary(diary, tpl);
    const rule: NotificationRule = {
      id: newId(), diaryId: diary.id, blockId: tpl.version.blocks[0]!.id, op: '>=', value: 7, consecutiveDays: 3, cooldownHours: 24,
      hlc: '0000000000001:0000:dev1', updatedAt: new Date(clock.now()).toISOString(),
    };
    await repo.saveNotificationRule(rule);

    const doc = await createExport(repo, { appVersion: 'test', now: clock.now() });
    expect(doc.diaries[0]!.notificationRules).toEqual([rule]);

    const secret = { kind: 'password', password: 'sicheres passwort 123' } as const;
    const file = await createBackupFile(repo, secret, { appVersion: 'test', now: clock.now() });
    const opened = await openBackup(file, secret);
    expect(opened.diaries[0]!.notificationRules).toEqual([rule]);

    // frische Datenbank → Wiederherstellung
    const db2 = new StbDb(`stb-v3-exprules-b-${n}`);
    await db2.open();
    try {
      const records2 = createRecordRepository(db2, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false });
      const repo2 = createDiaryRepository(records2);
      const plan = await planImport(records2, opened, { newId });
      await applyImport(records2, plan);
      expect(await repo2.listNotificationRules(diary.id)).toEqual([rule]);
      // idempotent
      expect((await planImport(records2, opened, { newId })).writes).toHaveLength(0);
    } finally {
      db2.close();
      await db2.delete();
    }
  });
  it('DM-15: Dashboards werden gespeichert, gelöscht, exportiert und per Import wiederhergestellt', async () => {
    const diary = createDiary({ id: newId(), name: 'Mein Tagebuch', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    const tpl = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId: diary.id, order: keyBetween(null, null), newId }, clock);
    await repo.createDiary(diary, tpl);
    const stamp = () => ({ hlc: `${String(clock.now()).padStart(13, '0')}:0000:dev1`, updatedAt: new Date(clock.now()).toISOString() });
    const a = addWidget(createDashboard({ id: newId(), diaryId: diary.id, name: 'Woche', }, [], stamp()), { id: newId(), kind: 'kpi', config: { blockId: tpl.version.blocks[0]!.id, stat: 'mean', days: 7 } }, stamp());
    const b = createDashboard({ id: newId(), diaryId: diary.id, name: 'Monat' }, [a], stamp());
    const gone = createDashboard({ id: newId(), diaryId: diary.id, name: 'Weg' }, [a, b], stamp());
    for (const d of [b, a, gone]) await repo.saveDashboard(d);
    expect((await repo.listDashboards(diary.id)).map((d) => d.name)).toEqual(['Woche', 'Monat', 'Weg']);
    await repo.deleteDashboard(gone.id, stamp());
    expect((await repo.listDashboards(diary.id)).map((d) => d.id)).toEqual([a.id, b.id]);

    const doc = await createExport(repo, { appVersion: 'test', now: clock.now() });
    expect(doc.diaries[0]!.dashboards).toEqual([a, b]);
    const db2 = new StbDb(`stb-v3-exprules-d-${n}`);
    await db2.open();
    try {
      const records2 = createRecordRepository(db2, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false });
      const plan = await planImport(records2, doc, { newId });
      await applyImport(records2, plan);
      expect(await createDiaryRepository(records2).listDashboards(diary.id)).toEqual([a, b]);
    } finally {
      db2.close();
      await db2.delete();
    }
  });
});
