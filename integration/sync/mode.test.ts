import { describe, it, expect, afterEach } from 'vitest';
import { createDevice, fixture, startServer } from './harness.js';
import { switchToCloudPrimary, switchToLocalOnly, getSyncMode, SyncModeError } from '../../apps/web/src/sync/mode.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function setup() {
  const f = await fixture();
  const server = await startServer(f.diaryId);
  closers.push(server.close);
  const d = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  closers.push(d.close);
  return { ...f, server, d };
}

describe('Sync-Modus', () => {
  it('SYN-12: Wechsel cloud-primary → local-only ist blockiert, solange die Outbox nicht leer ist', async () => {
    const { d, diaryId, newId } = await setup();
    await d.db.sync_state.put({ diaryId, cursor: 0, mode: 'cloud-primary' });
    d.wire.offline = true;
    await d.records.put({ id: newId(), diaryId, kind: 'entry', payload: { v: 1 } });

    const err = await switchToLocalOnly(d.db, diaryId, { pull: () => d.engine.pullDiary(diaryId).then(() => undefined) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SyncModeError);
    expect((err as SyncModeError).code).toBe('server-unreachable');
    expect(await getSyncMode(d.db, diaryId)).toBe('cloud-primary');

    d.wire.offline = false;
    const err2 = await switchToLocalOnly(d.db, diaryId, { pull: () => d.engine.pullDiary(diaryId).then(() => undefined) }).catch((e: unknown) => e);
    expect((err2 as SyncModeError).code).toBe('outbox-not-empty');
    expect((err2 as SyncModeError).pending).toBe(1);
    expect(await getSyncMode(d.db, diaryId)).toBe('cloud-primary');

    await d.engine.sync();
    await switchToLocalOnly(d.db, diaryId, { pull: () => d.engine.pullDiary(diaryId).then(() => undefined) });
    expect(await getSyncMode(d.db, diaryId)).toBe('local-only');
  });

  it('SYN-12: vor dem Entkoppeln wird vollständig gepullt (nichts vom Server fehlt lokal)', async () => {
    const { server, d, diaryId, newId, dk, clock } = await setup();
    const other = await createDevice({ app: server.app, user: 'alice', diaryId, dk, clock });
    closers.push(other.close);
    const id = newId();
    await other.records.put({ id, diaryId, kind: 'entry', payload: { vonAnderemGeraet: true } });
    await other.engine.sync();

    await d.db.sync_state.put({ diaryId, cursor: 0, mode: 'cloud-primary' });
    await switchToLocalOnly(d.db, diaryId, { pull: () => d.engine.pullDiary(diaryId).then(() => undefined) });
    expect((await d.records.get(id))?.payload).toEqual({ vonAnderemGeraet: true });
  });

  it('SYN-12: local-only → cloud-primary legt alle lokalen Records in die Outbox (Erst-Push)', async () => {
    const { d, diaryId, newId, server } = await setup();
    const ids = [newId(), newId()];
    await d.db.records.bulkPut(ids.map((id) => ({ id, diaryId, kind: 'entry', rev: 0, deleted: 0 as const, codec: 'plain', payload: '{"lokal":true}', localUpdatedAt: 1 })));
    expect(await getSyncMode(d.db, diaryId)).toBe('local-only');
    await switchToCloudPrimary(d.db, diaryId, { now: () => 5 });
    expect(await getSyncMode(d.db, diaryId)).toBe('cloud-primary');
    expect((await d.db.outbox.toArray()).map((o) => o.recordId).sort()).toEqual([...ids].sort());
    await d.engine.sync();
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 2 });
  });
});
