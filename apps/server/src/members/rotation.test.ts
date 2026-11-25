import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { encryptRecord, generateDiaryKey } from '@stb/crypto';
import type { PushOp } from '@stb/sync-protocol';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';
import { envelopeEpoch } from '../epoch.js';

const D = 'diary-1';
let db: Db;
let app: FastifyInstance;
let dir: string;
let oldDk: CryptoKey;
let newDk: CryptoKey;

function member(principal: string, role: string, revoked = false) {
  db.prepare('INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at, revoked_at) VALUES (?, ?, ?, 1, ?, 0, ?)').run(D, principal, role, `wrap1-${principal}`, revoked ? 5 : null);
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stb-rot-'));
  db = openDatabase(':memory:');
  migrate(db);
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
  member('olga', 'owner');
  member('ed', 'editor');
  member('vic', 'viewer');
  member('eve', 'editor', true); // schon entfernt
  const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: dir, port: 0, host: '127.0.0.1' };
  app = buildApp({ config, db, auth: headerAuth, now: () => 1_700_000_000_000 });
  await app.ready();
  oldDk = await generateDiaryKey();
  newDk = await generateDiaryKey();
});
afterEach(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const as = (user: string) => ({ [TEST_AUTH_HEADER]: user });
const ct = (dk: CryptoKey, epoch: number, id: string, kind = 'entry', text = id) =>
  encryptRecord(dk, { diaryId: D, kind, recordId: id, keyEpoch: epoch }, new TextEncoder().encode(text));
const op = (recordId: string, ciphertext: string, baseRev = 0, kind = 'entry'): PushOp => ({ recordId, kind, baseRev, deleted: false, ciphertext });
const push = (user: string, ops: PushOp[]) => app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: as(user), payload: { diaryId: D, ops } });
const pull = (user: string) => app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${D}`, headers: as(user) });
const rotate = (user: string, body: unknown) => app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/rotate`, headers: as(user), payload: body as object });
const complete = (user: string) => app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/rotate/complete`, headers: as(user) });
const state = (user: string) => app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/rotation`, headers: as(user) });
const putBlob = (user: string, id: string, body: string) =>
  app.inject({ method: 'PUT', url: `/api/v1/blobs/${id}?diaryId=${D}`, headers: { ...as(user), 'content-type': 'text/plain' }, payload: body });

/** Gültiger Start: Wraps für genau die aktiven Mitglieder (olga, ed, vic) — eve ist entfernt. */
const start = (overrides: Record<string, unknown> = {}) => ({
  fromEpoch: 1,
  wraps: ['olga', 'ed', 'vic'].map((p) => ({ principalId: p, wrappedDk: `wrap2-${p}` })),
  prevDkWrap: 'prev-wrap',
  ...overrides,
});
const memberRow = (p: string) => db.prepare('SELECT key_epoch, wrapped_dk, revoked_at FROM memberships WHERE diary_id = ? AND principal_id = ?').get(D, p) as { key_epoch: number; wrapped_dk: string; revoked_at: number | null };

describe('DK-Rotation: Server', () => {
  it('CRY-22: Epoche aus dem Envelope lesen (lenient: unbekanntes Format = Epoche 1)', async () => {
    expect(envelopeEpoch(await ct(oldDk, 1, 'a'))).toBe(1);
    expect(envelopeEpoch(await ct(newDk, 7, 'a'))).toBe(7);
    expect(envelopeEpoch(await ct(newDk, 0x01020304, 'a'))).toBe(0x01020304);
    for (const odd of ['', 'ct-abc', 'äöü', '!!!!!!!!!!']) expect(envelopeEpoch(odd)).toBe(1);
  });

  it('CRY-22: Owner startet die Rotation atomar — neue Wraps nur für aktive Mitglieder, das entfernte bekommt keinen', async () => {
    const r = await rotate('olga', start());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ keyEpoch: 2 });
    for (const p of ['olga', 'ed', 'vic']) expect(memberRow(p), p).toMatchObject({ key_epoch: 2, wrapped_dk: `wrap2-${p}` });
    expect(memberRow('eve')).toMatchObject({ key_epoch: 1, wrapped_dk: 'wrap1-eve' });
    expect((await state('ed')).json()).toMatchObject({ keyEpoch: 2, rotating: true, fromEpoch: 1, prevDkWrap: 'prev-wrap' });
  });

  it('CRY-22: ungültige Wraps (fehlendes, zusätzliches oder doppeltes Mitglied) werden abgelehnt und ändern nichts', async () => {
    const wraps = (ids: string[]) => ids.map((p) => ({ principalId: p, wrappedDk: `w-${p}` }));
    for (const ids of [['olga', 'ed'], ['olga', 'ed', 'vic', 'eve'], ['olga', 'ed', 'vic', 'vic'], ['olga', 'ed', 'vic', 'fremd']]) {
      const r = await rotate('olga', start({ wraps: wraps(ids) }));
      expect(r.statusCode, ids.join(',')).toBe(400);
      expect(r.json()).toEqual({ error: 'wraps-mismatch' });
    }
    expect(db.prepare('SELECT key_epoch, rotation_from FROM diaries WHERE id = ?').get(D)).toEqual({ key_epoch: 1, rotation_from: null });
    for (const p of ['olga', 'ed', 'vic']) expect(memberRow(p).wrapped_dk).toBe(`wrap1-${p}`);
    // Formfehler
    expect((await rotate('olga', { fromEpoch: 1 })).statusCode).toBe(400);
    expect((await rotate('olga', start({ extra: 1 }))).statusCode).toBe(400);
  });

  it('CRY-22: nur der Owner darf rotieren; falsche Ausgangsepoche und doppelter Start → 409', async () => {
    expect((await rotate('ed', start())).statusCode).toBe(403);
    expect((await rotate('vic', start())).statusCode).toBe(403);
    expect((await rotate('eve', start())).statusCode).toBe(403);
    expect((await rotate('fremd', start())).statusCode).toBe(403);
    const wrong = await rotate('olga', start({ fromEpoch: 3 }));
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json()).toEqual({ error: 'epoch-mismatch', keyEpoch: 1 });
    expect((await rotate('olga', start())).statusCode).toBe(200);
    const again = await rotate('olga', start({ fromEpoch: 2 }));
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'rotation-running' });
    expect(memberRow('olga').key_epoch).toBe(2);
  });

  it('CRY-22: nach dem Start wird nur noch mit der neuen Epoche geschrieben (alte → 409, nichts geschrieben); Lesen beider Epochen bleibt', async () => {
    const old1 = await ct(oldDk, 1, 'e1');
    expect((await push('olga', [op('e1', old1)])).statusCode).toBe(200);
    expect((await rotate('olga', start())).statusCode).toBe(200);

    const stale = await push('ed', [op('e2', await ct(oldDk, 1, 'e2')), op('e3', await ct(newDk, 2, 'e3'))]);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'stale-epoch', keyEpoch: 2 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 1 }); // auch die gültige Op wurde nicht geschrieben
    const fresh = await push('ed', [op('e3', await ct(newDk, 2, 'e3'))]);
    expect(fresh.statusCode).toBe(200);
    // Pull liefert beide Epochen
    const recs = (await pull('vic')).json().records as { recordId: string; ciphertext: string }[];
    expect(recs.map((r) => [r.recordId, envelopeEpoch(r.ciphertext)])).toEqual([['e1', 1], ['e3', 2]]);
  });

  it('CRY-22: Abschluss erst, wenn nichts mehr in der alten Epoche liegt; danach kein Push mit alter Epoche (409)', async () => {
    expect((await push('olga', [op('e1', await ct(oldDk, 1, 'e1')), op('t1', await ct(oldDk, 1, 't1', 'template'), 0, 'template')])).statusCode).toBe(200);
    expect((await rotate('olga', start())).statusCode).toBe(200);
    expect((await state('olga')).json()).toMatchObject({ pendingRecords: 2, pendingBlobs: 0 });

    const early = await complete('olga');
    expect(early.statusCode).toBe(409);
    expect(early.json()).toEqual({ error: 'rotation-incomplete', pendingRecords: 2, pendingBlobs: 0 });
    expect((await complete('ed')).statusCode).toBe(403);

    // Re-Encrypt in zwei Schritten: eine Op, dann die nächste — dazwischen bleibt der Zustand lesbar und "läuft"
    expect((await push('olga', [op('e1', await ct(newDk, 2, 'e1', 'entry', 'neu'), 1)])).statusCode).toBe(200);
    expect((await state('olga')).json()).toMatchObject({ rotating: true, pendingRecords: 1 });
    expect((await complete('olga')).statusCode).toBe(409);
    expect((await push('olga', [op('t1', await ct(newDk, 2, 't1', 'template'), 1, 'template')])).statusCode).toBe(200);

    const done = await complete('olga');
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ keyEpoch: 2, rotating: false });
    expect(db.prepare('SELECT rotation_from, prev_dk_wrap FROM diaries WHERE id = ?').get(D)).toEqual({ rotation_from: null, prev_dk_wrap: null });
    // idempotent
    expect((await complete('olga')).json()).toEqual({ keyEpoch: 2, rotating: false });
    // jetzt ist die alte Epoche endgültig gesperrt
    const late = await push('olga', [op('e9', await ct(oldDk, 1, 'e9'))]);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ error: 'stale-epoch', keyEpoch: 2 });
    expect((await state('ed')).json()).toMatchObject({ keyEpoch: 2, rotating: false, prevDkWrap: null, pendingRecords: 0 });
  });

  it('CRY-22: Tombstones (deleted) zählen als Records der alten Epoche', async () => {
    expect((await push('olga', [{ ...op('e1', await ct(oldDk, 1, 'e1')), deleted: true }])).statusCode).toBe(200);
    await rotate('olga', start());
    expect((await state('olga')).json()).toMatchObject({ pendingRecords: 1 });
  });

  it('CRY-22: ein entferntes Mitglied bekommt keine neuen Daten und keinen Wrap (403 auf Pull, Push, Zustand)', async () => {
    await rotate('olga', start());
    await push('olga', [op('e1', await ct(newDk, 2, 'e1'))]);
    expect((await pull('eve')).statusCode).toBe(403);
    expect((await push('eve', [op('e2', await ct(newDk, 2, 'e2'))])).statusCode).toBe(403);
    expect((await state('eve')).statusCode).toBe(403);
    expect(memberRow('eve').wrapped_dk).toBe('wrap1-eve');
    // das verbleibende Mitglied synchronisiert weiter
    expect((await pull('ed')).statusCode).toBe(200);
    expect((await push('ed', [op('e4', await ct(newDk, 2, 'e4'))])).statusCode).toBe(200);
  });

  it('CRY-22: Blobs — nur mit aktueller Epoche; während der Rotation ersetzt der Owner sie, andere nicht; Abschluss wartet auf Blobs', async () => {
    const oldBlob = await ct(oldDk, 1, 'b1', 'blob');
    expect((await putBlob('olga', 'b1', oldBlob)).statusCode).toBe(201);
    await rotate('olga', start());
    expect((await state('olga')).json()).toMatchObject({ pendingBlobs: 1 });
    expect((await complete('olga')).json()).toMatchObject({ error: 'rotation-incomplete', pendingBlobs: 1 });

    expect((await putBlob('ed', 'b2', await ct(oldDk, 1, 'b2', 'blob'))).statusCode).toBe(409); // alte Epoche
    const newBlob = await ct(newDk, 2, 'b1', 'blob');
    expect((await putBlob('ed', 'b1', newBlob)).json()).toEqual({ status: 'exists' }); // Editor ersetzt nichts
    expect((await putBlob('olga', 'b1', newBlob)).json()).toEqual({ status: 'replaced' });
    expect(readFileSync(join(dir, `${D}/b1`), 'utf8')).toBe(newBlob);
    expect((await putBlob('olga', 'b1', newBlob)).json()).toEqual({ status: 'exists' }); // idempotent
    expect((await complete('olga')).statusCode).toBe(200);
    expect((await putBlob('ed', 'b3', await ct(newDk, 2, 'b3', 'blob'))).statusCode).toBe(201);
  });

  it('CRY-22: Migration 11 auf einer alten Datenbank (Schema 10) behält Daten; Bestand ist Epoche 1', () => {
    const old = openDatabase(':memory:');
    migrate(old);
    old.exec('ALTER TABLE diaries DROP COLUMN key_epoch; ALTER TABLE diaries DROP COLUMN rotation_from; ALTER TABLE diaries DROP COLUMN prev_dk_wrap; ALTER TABLE records DROP COLUMN key_epoch; ALTER TABLE blobs DROP COLUMN key_epoch; ALTER TABLE memberships DROP COLUMN can_edit_templates');
    old.pragma('user_version = 10');
    old.prepare("INSERT INTO diaries (id, created_at) VALUES ('alt', 1)").run();
    old.prepare("INSERT INTO records (id, diary_id, kind, rev, seq, deleted, ciphertext, size, updated_at) VALUES ('r', 'alt', 'entry', 1, 1, 0, 'ct', 2, 1)").run();
    migrate(old);
    expect(old.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(11);
    expect(old.prepare("SELECT key_epoch, rotation_from FROM diaries WHERE id = 'alt'").get()).toEqual({ key_epoch: 1, rotation_from: null });
    expect(old.prepare("SELECT key_epoch, ciphertext FROM records WHERE id = 'r'").get()).toEqual({ key_epoch: 1, ciphertext: 'ct' });
    old.close();
  });
});
