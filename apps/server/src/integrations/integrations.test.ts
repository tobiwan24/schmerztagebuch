import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { createIntegrationCredentials, decryptRecord, encryptRecord, generateDiaryKey, parseAccessString, unwrapDkForMember } from '@stb/crypto';
import { integrationRecordsResponseSchema, type IntegrationInfo } from '@stb/sync-protocol';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';

const D = 'diary-1';
const NOW = 1_700_000_000_000;
let db: Db;
let app: FastifyInstance;
let dk: CryptoKey;
let logs = '';

const as = (user: string) => ({ [TEST_AUTH_HEADER]: user });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const enc = JSON.stringify;

function member(principal: string, role: string) {
  db.prepare('INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, ?, ?, 1, ?, 0)').run(D, principal, role, `wrap1-${principal}`);
}
const ctx = { diaryId: D, keyEpoch: 1 };

async function record(id: string, seq: number, text: string, kind = 'entry') {
  const ciphertext = await encryptRecord(dk, { diaryId: D, kind, recordId: id, keyEpoch: 1 }, new TextEncoder().encode(text));
  db.prepare('INSERT INTO records (id, diary_id, kind, rev, seq, deleted, ciphertext, size, updated_at, key_epoch) VALUES (?, ?, ?, 1, ?, 0, ?, ?, 0, 1)').run(id, D, kind, seq, ciphertext, ciphertext.length);
}

beforeEach(async () => {
  logs = '';
  db = openDatabase(':memory:');
  migrate(db);
  for (const u of ['olga', 'ed']) db.prepare('INSERT INTO users (id, username, created_at) VALUES (?, ?, 0)').run(u, u);
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
  member('olga', 'owner');
  member('ed', 'editor');
  dk = await generateDiaryKey();
  const logStream = new Writable({ write(chunk, _e, cb) { logs += String(chunk); cb(); } });
  const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: 'x', port: 0, host: '127.0.0.1' };
  app = buildApp({ config, db, auth: headerAuth, now: () => NOW, logStream });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

/** Legt eine Integration an wie der Client: Schlüssel, Wrap, Hash; der Server bekommt nie den Token. */
async function createIntegration(user = 'olga', name = 'MCP Laptop') {
  const c = await createIntegrationCredentials(dk, ctx);
  const res = await app.inject({
    method: 'POST', url: `/api/v1/diaries/${D}/integrations`, headers: as(user),
    payload: { nameCt: name, publicKey: c.publicKey, tokenHash: c.tokenHash, wrappedDk: enc(c.wrap), keyEpoch: 1 },
  });
  return { c, res, id: res.statusCode === 201 ? (res.json() as { id: string }).id : '' };
}
const records = (token: string, query = '') => app.inject({ method: 'GET', url: `/api/v1/integration/records${query}`, headers: bearer(token) });

describe('Integrationen: Server', () => {
  it('CRY-24: Owner legt eine Integration an, listet und widerruft sie; Editor und Fremde dürfen nichts', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/integrations` })).statusCode).toBe(401);
    expect((await createIntegration('ed')).res.statusCode).toBe(403);
    const { c, res, id } = await createIntegration();
    expect(res.statusCode).toBe(201);
    expect(id).not.toBe('');
    // Der Server hat nur Hash, öffentlichen Schlüssel, Wrap und Namen — nie den Token
    expect(JSON.stringify(db.prepare('SELECT * FROM integrations').all())).not.toContain(c.token);
    expect(db.prepare("SELECT kind, public_key FROM devices WHERE id = ?").get(id)).toEqual({ kind: 'integration', public_key: c.publicKey });
    expect(db.prepare('SELECT role, key_epoch FROM memberships WHERE principal_id = ?').get(id)).toEqual({ role: 'viewer', key_epoch: 1 });

    for (const user of ['ed', 'fremd']) expect((await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/integrations`, headers: as(user) })).statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/integrations`, headers: as('olga') });
    expect(list.json<IntegrationInfo[]>()).toEqual([{ id, nameCt: 'MCP Laptop', createdAt: NOW, lastUsedAt: null, revokedAt: null }]);

    for (const user of ['ed', 'fremd']) expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/integrations/${id}`, headers: as(user) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/integrations/unbekannt`, headers: as('olga') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/integrations/${id}`, headers: as('olga') })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/integrations`, headers: as('olga') })).json<IntegrationInfo[]>()[0]).toMatchObject({ id, revokedAt: NOW });
    // widerrufen: kein Zugriff mehr
    expect((await records(c.token)).statusCode).toBe(401);
  });

  it('CRY-24: Anlegen prüft Form, Epoche, Duplikate und die Obergrenze von 10 aktiven Integrationen', async () => {
    const c = await createIntegrationCredentials(dk, ctx);
    const good = { nameCt: 'x', publicKey: c.publicKey, tokenHash: c.tokenHash, wrappedDk: enc(c.wrap), keyEpoch: 1 };
    const post = (payload: object) => app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/integrations`, headers: as('olga'), payload });
    for (const bad of [{ ...good, tokenHash: 'kurz' }, { ...good, publicKey: 'x' }, { ...good, extra: 1 }, { ...good, keyEpoch: 0 }, { nameCt: 'x' }]) expect((await post(bad)).statusCode, enc(bad)).toBe(400);
    const stale = await post({ ...good, keyEpoch: 3 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'epoch-mismatch', keyEpoch: 1 });
    expect((await app.inject({ method: 'POST', url: '/api/v1/diaries/gibts-nicht/integrations', headers: as('olga'), payload: good })).statusCode).toBe(403);
    expect((await post(good)).statusCode).toBe(201);
    expect((await post(good)).json()).toEqual({ error: 'conflict' }); // gleicher Token-Hash
    for (let i = 0; i < 9; i++) expect((await createIntegration()).res.statusCode).toBe(201);
    const eleventh = await createIntegration();
    expect(eleventh.res.statusCode).toBe(409);
    expect(eleventh.res.json()).toEqual({ error: 'too-many-integrations' });
  });

  it('CRY-24: records liefert nur Chiffretext, Wrap und Epoche; die Integration entschlüsselt mit ihrem Zugangsstring', async () => {
    await record('e1', 1, 'Kopfschmerz 7');
    await record('t1', 2, 'Vorlage', 'template');
    await record('e2', 3, 'Rücken 4');
    const { c } = await createIntegration();
    const res = await records(c.token);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = integrationRecordsResponseSchema.parse(res.json());
    expect(body).toMatchObject({ diaryId: D, keyEpoch: 1, hasMore: false, nextSince: 3 });
    expect(body.records.map((r) => r.recordId)).toEqual(['e1', 't1', 'e2']);
    expect(res.body).not.toContain('Kopfschmerz'); // kein Klartext im Body
    const access = await parseAccessString(c.accessString);
    const myDk = await unwrapDkForMember(JSON.parse(body.wrappedDk), access.keyPair, ctx);
    const first = body.records[0]!;
    expect(new TextDecoder().decode(await decryptRecord(myDk, { diaryId: D, kind: first.kind, recordId: first.recordId, keyEpoch: 1 }, first.ciphertext))).toBe('Kopfschmerz 7');
    // `since` und `limit` paginieren; Nutzung wird vermerkt
    const page = integrationRecordsResponseSchema.parse((await records(c.token, '?since=1&limit=1')).json());
    expect(page.records.map((r) => r.recordId)).toEqual(['t1']);
    expect(page).toMatchObject({ hasMore: true, nextSince: 2 });
    expect((await records(c.token, '?limit=0')).statusCode).toBe(400);
    expect(db.prepare('SELECT last_used_at FROM integrations').get()).toEqual({ last_used_at: NOW });
  });

  it('CRY-24: ohne, mit falschem oder fremdem Token → 401; ein Sitzungs-Token ist kein Integrations-Token', async () => {
    const { c } = await createIntegration();
    expect((await app.inject({ method: 'GET', url: '/api/v1/integration/records' })).statusCode).toBe(401);
    expect((await records('stbi_' + 'A'.repeat(43))).statusCode).toBe(401);
    expect((await records('irgendwas')).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/integration/records', headers: as('olga') })).statusCode).toBe(401);
    expect((await records(c.token)).statusCode).toBe(200);
  });

  it('CRY-24: ein Integrations-Token darf nie schreiben — Push, Pull, Blobs, Geräte, Mitglieder → 403 integration-read-only, nichts wird geschrieben', async () => {
    const { c } = await createIntegration();
    const h = bearer(c.token);
    const push = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: h, payload: { diaryId: D, ops: [{ recordId: 'x', kind: 'entry', baseRev: 0, deleted: false, ciphertext: 'abc' }] } });
    expect(push.statusCode).toBe(403);
    expect(push.json()).toEqual({ error: 'integration-read-only' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 0 });
    const others: [string, string][] = [
      ['GET', `/api/v1/sync/pull?diaryId=${D}`], ['GET', '/api/v1/devices'], ['GET', `/api/v1/diaries/${D}/members`], ['GET', '/api/v1/diaries'],
      ['POST', `/api/v1/diaries/${D}/integrations`], ['PUT', `/api/v1/blobs/b1?diaryId=${D}`], ['DELETE', `/api/v1/diaries/${D}/integrations/x`],
      ['POST', '/api/v1/shares'], ['POST', `/api/v1/diaries/${D}/rotate`],
    ];
    for (const [method, url] of others) expect((await app.inject({ method: method as 'GET', url, headers: h })).statusCode, `${method} ${url}`).toBe(403);
    // auch POST auf den Records-Pfad
    expect((await app.inject({ method: 'POST', url: '/api/v1/integration/records', headers: h, payload: {} })).statusCode).toBe(403);
  });

  it('CRY-24: Rate-Limit je Integration (120/min) → 429 mit retry-after; andere Integrationen bleiben unberührt', async () => {
    const a = await createIntegration();
    const b = await createIntegration();
    for (let i = 0; i < 120; i++) expect((await records(a.c.token)).statusCode).toBe(200);
    const limited = await records(a.c.token);
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await records(b.c.token)).statusCode).toBe(200);
  });

  it('CRY-24: Integrationen erscheinen weder in Mitglieder- noch in Geräteliste und lassen sich dort nicht verwalten', async () => {
    const { id } = await createIntegration();
    const members = (await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/members`, headers: as('olga') })).json<{ principalId: string }[]>();
    expect(members.map((m) => m.principalId).sort()).toEqual(['ed', 'olga']);
    expect((await app.inject({ method: 'GET', url: '/api/v1/devices', headers: as('olga') })).json()).toEqual([]);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/diaries/${D}/members/${id}`, headers: as('olga'), payload: { role: 'editor' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/members/${id}`, headers: as('olga') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/devices/${id}`, headers: as('olga') })).statusCode).toBe(404);
    expect(db.prepare('SELECT role FROM memberships WHERE principal_id = ?').get(id)).toEqual({ role: 'viewer' });
  });

  it('CRY-24: DK-Rotation widerruft Integrationen und verlangt keinen Wrap für sie; ein fehlgeschlagener Start ändert nichts', async () => {
    const { c, id } = await createIntegration();
    const rotate = (wraps: string[]) =>
      app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/rotate`, headers: as('olga'), payload: { fromEpoch: 1, wraps: wraps.map((p) => ({ principalId: p, wrappedDk: `w2-${p}` })), prevDkWrap: 'prev' } });
    expect((await rotate(['olga'])).statusCode).toBe(400); // ed fehlt
    expect((await records(c.token)).statusCode).toBe(200); // nichts widerrufen
    expect((await rotate(['olga', 'ed', id])).statusCode).toBe(400); // Wrap für die Integration ist nicht erlaubt
    expect((await rotate(['olga', 'ed'])).statusCode).toBe(200);
    expect((await records(c.token)).statusCode).toBe(401);
    expect(db.prepare('SELECT revoked_at FROM devices WHERE id = ?').get(id)).toEqual({ revoked_at: expect.any(Number) });
    // keine neuen Zugänge während der Rotation
    const again = await createIntegration();
    expect(again.res.statusCode).toBe(409);
    expect(again.res.json()).toEqual({ error: 'rotation-running' });
  });

  it('CRY-24: Der Token steht in keinem Log', async () => {
    const { c } = await createIntegration();
    await records(c.token);
    await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: bearer(c.token), payload: {} });
    expect(logs).not.toBe('');
    expect(logs).not.toContain(c.token);
    expect(logs).not.toContain(c.tokenHash);
  });
});

describe('Schema-Migration devices.kind (CRY-24)', () => {
  function oldDatabase(): Db {
    const old = openDatabase(':memory:');
    migrate(old, 12);
    old.prepare("INSERT INTO users (id, username, created_at) VALUES ('u1', 'olga', 1)").run();
    old.prepare("INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at, revoked_at) VALUES ('d1', 'u1', 'device', 'ct-name', 'pk', 5, NULL), ('d2', 'u1', 'device', 'ct-alt', 'pk2', 6, 9)").run();
    old.prepare("INSERT INTO sessions (token_hash, user_id, device_id, created_at, expires_at) VALUES ('h1', 'u1', 'd1', 1, 99)").run();
    return old;
  }

  it('CRY-24: Eine DB mit Schema 12 (Geräte, Sitzungen) wird auf 13 gebracht: Zeilen und Sitzungen bleiben, Fremdschlüssel intakt, kind erlaubt \'integration\'', () => {
    const old = oldDatabase();
    expect(old.pragma('user_version', { simple: true })).toBe(12);
    // vorher: 'integration' ist durch den CHECK abgelehnt
    expect(() => old.prepare("INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES ('x', 'u1', 'integration', 'n', 'p', 1)").run()).toThrow(/CHECK/);
    migrate(old);
    expect(old.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(13);
    expect(old.prepare('SELECT id, kind, name_ct, public_key, created_at, revoked_at FROM devices ORDER BY id').all()).toEqual([
      { id: 'd1', kind: 'device', name_ct: 'ct-name', public_key: 'pk', created_at: 5, revoked_at: null },
      { id: 'd2', kind: 'device', name_ct: 'ct-alt', public_key: 'pk2', created_at: 6, revoked_at: 9 },
    ]);
    expect(old.prepare('SELECT token_hash, device_id FROM sessions').all()).toEqual([{ token_hash: 'h1', device_id: 'd1' }]);
    expect(old.pragma('foreign_key_check')).toEqual([]);
    old.prepare("INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES ('i1', 'u1', 'integration', 'n', 'p', 1)").run();
    expect(() => old.prepare("INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES ('i2', 'u1', 'sonstwas', 'n', 'p', 1)").run()).toThrow(/CHECK/);
    // die Fremdschlüssel gelten weiter: Sitzung auf unbekanntes Gerät, Gerät ohne Nutzer
    expect(() => old.prepare("INSERT INTO sessions (token_hash, user_id, device_id, created_at, expires_at) VALUES ('h2', 'u1', 'gibts-nicht', 1, 2)").run()).toThrow(/FOREIGN KEY/);
    expect(() => old.prepare("INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES ('i3', 'niemand', 'device', 'n', 'p', 1)").run()).toThrow(/FOREIGN KEY/);
    old.close();
  });

  it('CRY-24: Migration ist wiederholbar (zweiter Lauf ohne Wirkung)', () => {
    const old = oldDatabase();
    migrate(old);
    const v = old.pragma('user_version', { simple: true });
    migrate(old);
    expect(old.pragma('user_version', { simple: true })).toBe(v);
    expect(old.prepare('SELECT COUNT(*) AS n FROM devices').get()).toEqual({ n: 2 });
    old.close();
  });
});
