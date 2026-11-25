import { describe, it, expect, afterEach } from 'vitest';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { leaveDiary } from '../../apps/web/src/sharing/leave.js';
import { createDevice, fixture, startServer } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

describe('Austreten', () => {
  it('SHR-11: Austreten löscht die lokalen Daten des Tagebuchs auf dem Gerät des Mitglieds', async () => {
    const f = await fixture();
    const server = await startServer(f.diaryId, ['olga', 'bob']);
    closers.push(server.close);
    const bob = await createDevice({ app: server.app, user: 'bob', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
    closers.push(bob.close);
    const otherDiary = f.newId();

    await bob.records.put({ id: f.newId(), diaryId: f.diaryId, kind: 'entry', payload: { v: 1 } });
    await bob.engine.sync();
    await bob.records.put({ id: f.newId(), diaryId: f.diaryId, kind: 'entry', payload: { offen: true } }); // ausstehend
    await bob.db.records.put({ id: f.newId(), diaryId: f.diaryId, kind: 'conflictLog', rev: 0, deleted: 0, codec: 'plain', payload: '{}', localUpdatedAt: 1 });
    await bob.db.keys.put({ id: `dk:${f.diaryId}`, value: { diaryId: f.diaryId, wrapped: 'x' } });
    const keep = f.newId();
    await bob.records.put({ id: keep, diaryId: otherDiary, kind: 'entry', payload: { anderes: true } });
    await bob.db.keys.put({ id: `dk:${otherDiary}`, value: { diaryId: otherDiary, wrapped: 'y' } });

    await leaveDiary({
      async leave(diaryId) {
        const r = await server.app.inject({ method: 'DELETE', url: `/api/v1/diaries/${diaryId}/members/bob`, headers: { [TEST_AUTH_HEADER]: 'bob' } });
        if (r.statusCode !== 204) throw new Error(`leave ${r.statusCode}`);
      },
    }, bob.db, f.diaryId);

    expect((await bob.db.records.toArray()).map((r) => r.id)).toEqual([keep]);
    expect((await bob.db.outbox.toArray()).every((o) => o.diaryId === otherDiary)).toBe(true);
    expect(await bob.db.sync_state.get(f.diaryId)).toBeUndefined();
    expect((await bob.db.keys.toArray()).map((k) => k.id)).toEqual([`dk:${otherDiary}`]);
    // serverseitig ausgetreten
    expect((await server.app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${f.diaryId}`, headers: { [TEST_AUTH_HEADER]: 'bob' } })).statusCode).toBe(403);
  });

  it('SHR-11: schlägt der Austritt beim Server fehl, bleiben die lokalen Daten erhalten', async () => {
    const f = await fixture();
    const server = await startServer(f.diaryId, ['olga']);
    closers.push(server.close);
    const d = await createDevice({ app: server.app, user: 'olga', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
    closers.push(d.close);
    await d.records.put({ id: f.newId(), diaryId: f.diaryId, kind: 'entry', payload: { v: 1 } });
    await expect(leaveDiary({ async leave() { throw new Error('last-owner'); } }, d.db, f.diaryId)).rejects.toThrow('last-owner');
    expect(await d.db.records.count()).toBe(1);
  });
});
