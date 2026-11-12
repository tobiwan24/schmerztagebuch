import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pullResponseSchema, pushResponseSchema, type PushOp } from '@stb/sync-protocol';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';

const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const DIARY = 'diary-1';
const OTHER = 'diary-2';

let db: Db;
let app: FastifyInstance;

beforeEach(async () => {
  db = openDatabase(':memory:');
  migrate(db);
  db.prepare("INSERT INTO diaries (id, created_at) VALUES (?, 0), (?, 0)").run(DIARY, OTHER);
  db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'alice', 'owner', 1, 'w', 0)").run(DIARY);
  app = buildApp({ config, db, auth: headerAuth });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

const op = (recordId: string, baseRev: number, ciphertext = `ct-${recordId}-${baseRev}`, deleted = false): PushOp => ({ recordId, kind: 'entry', baseRev, deleted, ciphertext });

async function push(ops: PushOp[], user = 'alice', diaryId = DIARY) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { [TEST_AUTH_HEADER]: user }, payload: { diaryId, ops } });
  return { status: res.statusCode, headers: res.headers, body: res.statusCode === 200 ? pushResponseSchema.parse(res.json()) : res.json() };
}
async function pull(since = 0, limit?: number, user = 'alice') {
  const res = await app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${DIARY}&since=${since}${limit ? `&limit=${limit}` : ''}`, headers: { [TEST_AUTH_HEADER]: user } });
  return { status: res.statusCode, headers: res.headers, body: res.statusCode === 200 ? pullResponseSchema.parse(res.json()) : res.json() };
}

describe('Sync-Endpunkte', () => {
  it('SYN-03: neue Records mit baseRev 0 werden übernommen (rev 1, aufsteigende seq)', async () => {
    const r = await push([op('a', 0), op('b', 0)]);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.results).toEqual([
      { recordId: 'a', status: 'applied', rev: 1, seq: 1 },
      { recordId: 'b', status: 'applied', rev: 1, seq: 2 },
    ]);
  });

  it('SYN-03: Op mit veralteter baseRev wird als conflict abgelehnt und liefert die Serverversion', async () => {
    await push([op('a', 0, 'v1')]);
    await push([op('a', 1, 'v2')]);
    const stale = await push([op('a', 1, 'v2-von-geraet-b')]);
    expect(stale.body.results).toEqual([{ recordId: 'a', status: 'conflict', server: { rev: 2, ciphertext: 'v2', deleted: false } }]);
    // Serverstand unverändert
    const p = await pull();
    expect(p.body.records.map((x) => [x.recordId, x.rev, x.ciphertext])).toEqual([['a', 2, 'v2']]);
  });

  it('SYN-03: baseRev > 0 für unbekannten Record → conflict mit leerem Serverstand; baseRev 0 für bestehenden → conflict', async () => {
    expect((await push([op('neu', 3)])).body.results[0]).toEqual({ recordId: 'neu', status: 'conflict', server: { rev: 0, ciphertext: null, deleted: false } });
    await push([op('a', 0, 'v1')]);
    expect((await push([op('a', 0, 'doppelt')])).body.results[0]).toMatchObject({ status: 'conflict', server: { rev: 1, ciphertext: 'v1' } });
  });

  it('SYN-03: Konflikte einzelner Ops blockieren die übrigen Ops desselben Pushs nicht', async () => {
    await push([op('a', 0)]);
    const r = await push([op('a', 0), op('b', 0)]);
    expect(r.body.results.map((x) => x.status)).toEqual(['conflict', 'applied']);
  });

  it('SYN-03: Löschung wird als Tombstone mit neuer rev übernommen', async () => {
    await push([op('a', 0)]);
    await push([op('a', 1, 'tomb', true)]);
    const p = await pull();
    expect(p.body.records).toMatchObject([{ recordId: 'a', rev: 2, deleted: true }]);
  });

  it('SYN-03: gleiche Record-ID in einem anderen Tagebuch ist unabhängig — weder überschreib- noch vorab belegbar', async () => {
    db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'mallory', 'owner', 1, 'w', 0)").run(OTHER);
    // mallory belegt die ID zuerst in ihrem eigenen Tagebuch
    expect((await push([op('x', 0, 'mallory')], 'mallory', OTHER)).body.results[0]).toMatchObject({ status: 'applied' });
    // alice' Push in ihr Tagebuch wird davon nicht blockiert
    expect((await push([op('x', 0, 'alice')])).body.results[0]).toMatchObject({ status: 'applied', rev: 1 });
    expect((await pull()).body.records.map((r) => r.ciphertext)).toEqual(['alice']);
    // und mallory kann alice' Record nicht überschreiben
    expect((await push([op('x', 1, 'übernommen')], 'mallory', OTHER)).body.results[0]).toMatchObject({ status: 'applied' });
    expect((await pull()).body.records.map((r) => r.ciphertext)).toEqual(['alice']);
  });

  it('SYN-03: andere Record-Art unter derselben ID im selben Tagebuch → conflict', async () => {
    await push([op('x', 0)]);
    expect((await push([{ ...op('x', 1), kind: 'template' }])).body.results[0]).toMatchObject({ status: 'conflict' });
  });

  it('SYN-03: Pull liefert seq > since, sortiert und paginiert', async () => {
    await push([op('a', 0), op('b', 0), op('c', 0)]);
    const first = await pull(0, 2);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toMatchObject({ nextSince: 2, hasMore: true });
    expect(first.body.records.map((x) => x.recordId)).toEqual(['a', 'b']);
    const second = await pull(first.body.nextSince, 2);
    expect(second.body).toMatchObject({ nextSince: 3, hasMore: false });
    expect(second.body.records.map((x) => x.recordId)).toEqual(['c']);
    expect((await pull(3)).body).toEqual({ records: [], nextSince: 3, hasMore: false });
  });

  it('SYN-03: ohne Anmeldung 401, ohne Mitgliedschaft 403, ungültiger Body 400', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: { diaryId: DIARY, ops: [op('a', 0)] } })).statusCode).toBe(401);
    expect((await push([op('a', 0)], 'mallory')).status).toBe(403);
    expect((await pull(0, undefined, 'mallory')).status).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { [TEST_AUTH_HEADER]: 'alice' }, payload: { diaryId: DIARY, ops: [] } })).statusCode).toBe(400);
    expect((await pull(0, 501)).status).toBe(400);
  });
});
