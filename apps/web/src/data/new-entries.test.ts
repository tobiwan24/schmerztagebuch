import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIdGenerator } from '@stb/core';
import { StbDb } from './db.js';
import { plainCodec } from './codec/plain.js';
import { createCodecRegistry } from './codec/registry.js';
import { createRecordRepository } from './repositories/records.js';
import { groupNewEntries, loadSeen, saveSeen } from './new-entries.js';

let db: StbDb;
let n = 0;
beforeEach(async () => {
  db = new StbDb(`stb-v3-new-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Neue Einträge anderer (SHR-15)', () => {
  it('SHR-15: zählt je anderem Autor, eigene Einträge nie, sortiert nach Anzahl', () => {
    const rows = [{ authorId: 'me' }, { authorId: 'bob' }, { authorId: 'eve' }, { authorId: 'bob' }, { authorId: 'me' }, { authorId: 'bob' }];
    expect(groupNewEntries(rows, 'me')).toEqual([{ authorId: 'bob', count: 3 }, { authorId: 'eve', count: 1 }]);
    expect(groupNewEntries([{ authorId: 'me' }], 'me')).toEqual([]);
    expect(groupNewEntries([], 'me')).toEqual([]);
  });

  it('SHR-15: „zuletzt gesehen“ je Tagebuch lokal gemerkt (nicht vorhanden → undefined)', async () => {
    expect(await loadSeen(db, 'd1')).toBeUndefined();
    await saveSeen(db, 'd1', 1234);
    expect(await loadSeen(db, 'd1')).toBe(1234);
    expect(await loadSeen(db, 'd2')).toBeUndefined();
    await saveSeen(db, 'd1', 5678);
    expect(await loadSeen(db, 'd1')).toBe(5678);
  });

  it('SHR-15: listUpdatedSince liefert nur nicht gelöschte Records der Art und des Tagebuchs, die nach dem Zeitpunkt ankamen', async () => {
    let t = 1000;
    const clock = { now: () => (t += 10) };
    const { newId } = createIdGenerator(clock);
    const repo = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false });
    const [old, fresh, gone, other, tpl] = [newId(), newId(), newId(), newId(), newId()];
    await repo.put({ id: old, diaryId: 'd1', kind: 'entry', payload: { x: 1 } });
    const since = clock.now();
    await repo.put({ id: fresh, diaryId: 'd1', kind: 'entry', payload: { x: 2 } });
    await repo.put({ id: gone, diaryId: 'd1', kind: 'entry', payload: { x: 3 } });
    await repo.remove(gone);
    await repo.put({ id: other, diaryId: 'd2', kind: 'entry', payload: { x: 4 } });
    await repo.put({ id: tpl, diaryId: 'd1', kind: 'template', payload: { x: 5 } });
    const rows = await repo.listUpdatedSince('d1', 'entry', since);
    expect(rows.map((r) => r.id)).toEqual([fresh]);
    expect(rows[0]!.localUpdatedAt).toBeGreaterThan(since);
  });
});
