import { describe, it, expect, afterEach } from 'vitest';
import { createDevice, fixture, startServer } from './harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function twoDevices(pullLimit?: number) {
  const f = await fixture();
  const server = await startServer(f.diaryId);
  closers.push(server.close);
  const a = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  closers.push(a.close);
  const b = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock, pullLimit });
  closers.push(b.close);
  return { ...f, server, a, b };
}

/** Viele Records schnell anlegen (eine Transaktion; die Engine behandelt Payloads generisch). */
async function seedEntries(device: Awaited<ReturnType<typeof createDevice>>, diaryId: string, newId: () => string, n: number) {
  const ids = Array.from({ length: n }, () => newId());
  await device.records.putMany(ids.map((id, i) => ({ id, diaryId, kind: 'entry', payload: { id, i, occurredAt: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` } })));
  return ids;
}

describe('Sync-Engine: Pull', () => {
  it('SYN-07: Pull paginiert korrekt über > 1.000 Records', async () => {
    const { a, b, diaryId, newId } = await twoDevices(500);
    const ids = await seedEntries(a, diaryId, newId, 1100);
    await a.engine.sync();
    expect(await a.db.outbox.count()).toBe(0);

    await b.engine.sync();
    expect(b.wire.pulls.map((q) => q.since)).toEqual([0, 500, 1000]);
    const got = await b.records.list(diaryId, 'entry');
    expect(got).toHaveLength(1100);
    expect(new Set(got.map((r) => r.id))).toEqual(new Set(ids));
    expect((await b.db.sync_state.get(diaryId))?.cursor).toBe(1100);
    expect((await b.db.records.get(ids[5]!))?.occurredAt).toBe('2026-01-01T00:00:05Z');
  }, 60_000);

  it('SYN-07: Cursor wird erst nach erfolgreichem Anwenden einer Seite gespeichert', async () => {
    const { a, b, diaryId, newId } = await twoDevices(10);
    const ids = await seedEntries(a, diaryId, newId, 25);
    await a.engine.sync();

    // Anwenden von Seite 2 scheitert (z. B. Speicherfehler): Transaktion bricht ab, Cursor bleibt bei 10.
    const failId = ids[14]!;
    const hook = (primKey: string) => {
      if (primKey === failId) throw new Error('Speicher voll');
    };
    b.db.records.hook('creating', hook);
    await expect(b.engine.sync()).rejects.toThrow('Speicher voll');
    expect((await b.db.sync_state.get(diaryId))?.cursor).toBe(10);
    expect(await b.db.records.count()).toBe(10);

    b.db.records.hook('creating').unsubscribe(hook);
    await b.engine.sync();
    expect((await b.db.sync_state.get(diaryId))?.cursor).toBe(25);
    expect(await b.db.records.count()).toBe(25);
  });

  it('SYN-08: Abbruch mitten im Pull (Netzwerkfehler) führt nicht zu Datenverlust oder übersprungenen Records', async () => {
    const { a, b, diaryId, newId } = await twoDevices(10);
    const ids = await seedEntries(a, diaryId, newId, 35);
    await a.engine.sync();

    b.wire.failPullFrom = 3; // Seiten 1 und 2 kommen an, die dritte Anfrage scheitert
    await expect(b.engine.sync()).rejects.toThrow('Netzwerkfehler');
    expect((await b.db.sync_state.get(diaryId))?.cursor).toBe(20);
    expect(await b.db.records.count()).toBe(20);

    b.wire.failPullFrom = undefined;
    await b.engine.sync();
    const got = (await b.records.list(diaryId, 'entry')).map((r) => r.id);
    expect(got).toHaveLength(35);
    expect(new Set(got)).toEqual(new Set(ids));
  });

  it('SYN-16: gelöschte Records (Tombstones) werden synchronisiert und auf dem Zweitgerät ausgeblendet', async () => {
    const { a, b, diaryId, newId } = await twoDevices();
    const [keep, drop] = await seedEntries(a, diaryId, newId, 2);
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.records.list(diaryId, 'entry')).map((r) => r.id).sort()).toEqual([keep, drop].sort());

    await a.records.remove(drop!);
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.records.list(diaryId, 'entry')).map((r) => r.id)).toEqual([keep]);
    expect((await b.db.records.get(drop!))?.deleted).toBe(1);
    expect((await b.records.get(drop!))?.deleted).toBe(true);
  });

  it('SYN-16: lokale ausstehende Änderung wird vom Pull nicht überschrieben', async () => {
    const { a, b, diaryId, newId } = await twoDevices();
    const [id] = await seedEntries(a, diaryId, newId, 1);
    await a.engine.sync();
    await b.engine.sync();
    await b.records.put({ id: id!, diaryId, kind: 'entry', payload: { lokal: true } });
    await a.records.put({ id: id!, diaryId, kind: 'entry', payload: { remote: true } });
    await a.engine.sync();
    const r = await b.engine.pullDiary(diaryId);
    expect(r.skippedPending).toBe(1);
    expect((await b.records.get(id!))?.payload).toEqual({ lokal: true });
  });
});
