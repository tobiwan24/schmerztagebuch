import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDiary, createIdGenerator, instantiateCatalogTemplate, keyBetween, type Entry } from '@stb/core';
import { StbDb } from './db.js';
import { plainCodec } from './codec/plain.js';
import { createCodecRegistry } from './codec/registry.js';
import { createRecordRepository } from './repositories/records.js';
import { createDiaryRepository, type DiaryRepository } from './repositories/diary.js';
import { createLocalAccount, loadAccount } from '../auth/local-account.js';
import { createExport } from './import-export.js';
import { AutoBackupDb, autoBackupInfo, readAutoBackup, runAutoBackup, AUTO_BACKUP_DB, type AutoBackupDeps } from './auto-backup.js';

const DAY = 86_400_000;
let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const { newId } = createIdGenerator(clock);
const MARKER = 'STB-PLAINTEXT-MARKER-AUTOBACKUP';

let db: StbDb;
let store: AutoBackupDb;
let n = 0;
let repo: DiaryRepository;
beforeEach(async () => {
  n++;
  db = new StbDb(`stb-v3-ab-${n}`);
  store = new AutoBackupDb(`stb-v3-ab-store-${n}`);
  await db.open();
  repo = createDiaryRepository(createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false }));
});
afterEach(async () => {
  db.close();
  await db.delete();
  store.close();
  await store.delete();
});

async function seed(): Promise<Entry> {
  const diary = createDiary({ id: newId(), name: 'Mein Tagebuch', subject: 'human', timezone: 'Europe/Berlin' }, clock);
  const tpl = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId: diary.id, order: keyBetween(null, null), newId }, clock);
  await repo.createDiary(diary, tpl);
  const now = new Date(clock.now()).toISOString();
  const entry: Entry = {
    id: newId(), diaryId: diary.id, templateId: tpl.template.id, templateVersion: tpl.version.version, occurredAt: now, recordedAt: now, updatedAt: now,
    authorId: 'user-1', values: {}, tags: [MARKER], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: '0000000000001:0000:dev1',
  };
  await repo.saveEntry(entry);
  return entry;
}

async function deps(umk: CryptoKey, now: () => number): Promise<AutoBackupDeps> {
  const account = (await loadAccount(db))!;
  return {
    store, umk, wraps: account.wraps, now,
    buildExport: async () => {
      const doc = await createExport(repo, { appVersion: 'test', now: now() });
      return { text: JSON.stringify(doc), exportedAt: doc.exportedAt, empty: doc.diaries.length === 0 };
    },
  };
}

describe('Auto-Sicherung', () => {
  it('EXP-17: nach Löschen von stb-v3 mit Passwort und mit Backup-Code vollständig wiederherstellbar, Speicher ohne Klartext-Marker', async () => {
    const entry = await seed();
    const { umk, backupCode } = await createLocalAccount(db, { factor: { kind: 'password', password: 'geheim lang genug' }, now: clock.now });
    expect(await runAutoBackup(await deps(umk, clock.now))).toBe('written');
    const original = await createExport(repo, { appVersion: 'test', now: 1 });

    db.close();
    await db.delete();
    // Neue, leere stb-v3 — die Auto-Sicherung liegt unberührt in ihrer eigenen DB
    db = new StbDb(`stb-v3-ab-gone-${n}`);
    await db.open();
    expect(await db.records.count()).toBe(0);

    for (const factor of [{ kind: 'password', password: 'geheim lang genug' }, { kind: 'backup', code: backupCode.toLowerCase() }] as const) {
      const doc = await readAutoBackup(store, factor);
      expect(doc.diaries).toEqual(original.diaries);
      expect(doc.diaries[0]!.entries.map((e) => e.id)).toEqual([entry.id]);
    }
    await expect(readAutoBackup(store, { kind: 'password', password: 'falsch' })).rejects.toMatchObject({ code: 'unwrap-failed' });

    const raw = JSON.stringify(await store.backups.toArray());
    expect(raw).not.toContain(MARKER);
    expect(raw).not.toContain('Mein Tagebuch');
    expect(AUTO_BACKUP_DB).not.toBe('stb-v3');
  });

  it('EXP-17: ohne Daten wird keine vorhandene Sicherung überschrieben', async () => {
    await seed();
    const { umk } = await createLocalAccount(db, { factor: { kind: 'password', password: 'geheim lang genug' }, now: clock.now });
    const d = await deps(umk, clock.now);
    expect(await runAutoBackup(d)).toBe('written');
    const before = await store.backups.get('latest');
    await db.records.clear();
    expect(await runAutoBackup(d, { force: true })).toBe('skipped');
    expect(await store.backups.get('latest')).toEqual(before);
  });

  it('EXP-17: höchstens 1× pro Tag; vor einem Update (force) immer; nur die letzte Sicherung bleibt', async () => {
    await seed();
    const { umk } = await createLocalAccount(db, { factor: { kind: 'password', password: 'geheim lang genug' }, now: clock.now });
    let now = 1_800_000_000_000;
    const d = await deps(umk, () => now);
    expect(await runAutoBackup(d)).toBe('written');
    const first = (await autoBackupInfo(store))!.createdAt;
    now += DAY - 1000;
    expect(await runAutoBackup(d)).toBe('skipped');
    expect((await autoBackupInfo(store))!.createdAt).toBe(first);
    expect(await runAutoBackup(d, { force: true })).toBe('written');
    now += DAY + 1000;
    expect(await runAutoBackup(d)).toBe('written');
    expect(await store.backups.count()).toBe(1);
  });
});
