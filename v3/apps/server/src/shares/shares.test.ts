import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const ID2 = 'BBBBBBBBBBBBBBBBBBBBBB';
const KEY = 'K'.repeat(43);
const DAY = 86_400_000;
let clock = 1_700_000_000_000;
let db: Db;
let app: FastifyInstance;
let logs = '';

beforeEach(async () => {
  clock = 1_700_000_000_000;
  logs = '';
  db = openDatabase(':memory:');
  migrate(db);
  const logStream = new Writable({
    write(chunk, _e, cb) {
      logs += String(chunk);
      cb();
    },
  });
  const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: 'x', port: 0, host: '127.0.0.1' };
  app = buildApp({ config, db, auth: headerAuth, now: () => clock, logStream });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

const create = (body: Record<string, unknown>, user = 'olga') =>
  app.inject({ method: 'POST', url: '/api/v1/shares', headers: { [TEST_AUTH_HEADER]: user }, payload: { id: ID, ciphertext: 'abc_DEF-123', ...body } });
const open = (id = ID, ip?: string) => app.inject({ method: 'GET', url: `/api/v1/shares/${id}`, ...(ip ? { remoteAddress: ip } : {}) });
const list = (user = 'olga') => app.inject({ method: 'GET', url: '/api/v1/shares', headers: { [TEST_AUTH_HEADER]: user } });
const revoke = (id = ID, user = 'olga') => app.inject({ method: 'DELETE', url: `/api/v1/shares/${id}`, headers: { [TEST_AUTH_HEADER]: user } });

describe('Arzt-Link Server', () => {
  it('EXP-22: Erstellen braucht Anmeldung, prüft Grenzen und lehnt doppelte IDs ab', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/shares', payload: { id: ID, ciphertext: 'abc' } })).statusCode).toBe(401);
    const ok = await create({});
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toEqual({ id: ID, expiresAt: clock + 14 * DAY, maxViews: 5 });
    expect((await create({})).statusCode).toBe(409);
    const bads = [{ expiresInDays: 31 }, { expiresInDays: 0 }, { maxViews: 21 }, { maxViews: 0 }, { ciphertext: 'kein base64url!' }, { ciphertext: '' }, { id: 'zu-kurz' }, { extra: 1 }];
    for (const bad of bads) {
      expect((await create({ id: ID2, ...bad })).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await create({ id: ID2, expiresInDays: 30, maxViews: 20 })).statusCode).toBe(201);
  });

  it('EXP-22: Abruf ohne Anmeldung zählt Aufrufe und antwortet nach max_views mit 410', async () => {
    await create({ maxViews: 2 });
    const a = await open();
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({ ciphertext: 'abc_DEF-123', viewsLeft: 1 });
    expect(a.headers['referrer-policy']).toBe('no-referrer');
    expect(a.headers['cache-control']).toBe('no-store');
    expect((await open()).json()).toMatchObject({ viewsLeft: 0 });
    const c = await open();
    expect(c.statusCode).toBe(410);
    expect(c.json()).toEqual({ error: 'exhausted' });
    expect((await list()).json().shares[0]).toMatchObject({ views: 2, status: 'exhausted' });
    expect((await open(ID2)).statusCode).toBe(404);
    expect((await open('..%2Fetc')).statusCode).toBe(404);
  });

  it('EXP-22: nach Ablauf 410, danach Aufräumen (Chiffretext weg, später Zeile weg)', async () => {
    await create({ expiresInDays: 1 });
    clock += DAY + 1;
    const r = await open();
    expect(r.statusCode).toBe(410);
    expect(r.json()).toEqual({ error: 'expired' });
    await list();
    expect(db.prepare('SELECT ciphertext FROM shares').get()).toEqual({ ciphertext: '' });
    clock += 8 * DAY;
    await list();
    expect(db.prepare('SELECT COUNT(*) AS n FROM shares').get()).toEqual({ n: 0 });
    expect((await open()).statusCode).toBe(404);
  });

  it('EXP-22: Liste und Widerruf nur für den Ersteller', async () => {
    await create({});
    expect((await app.inject({ method: 'GET', url: '/api/v1/shares' })).statusCode).toBe(401);
    expect((await list('mallory')).json()).toEqual({ shares: [] });
    const own = (await list()).json().shares;
    expect(own).toHaveLength(1);
    expect(JSON.stringify(own)).not.toContain('abc_DEF');
    expect((await revoke(ID, 'mallory')).statusCode).toBe(404);
    expect((await open()).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/shares/${ID}` })).statusCode).toBe(401);
    expect((await revoke()).statusCode).toBe(204);
    const r = await open();
    expect(r.statusCode).toBe(410);
    expect(r.json()).toEqual({ error: 'revoked' });
    expect((await list()).json().shares[0].status).toBe('revoked');
    expect(db.prepare('SELECT ciphertext FROM shares').get()).toEqual({ ciphertext: '' });
    expect((await revoke()).statusCode).toBe(404);
  });

  it('EXP-22: Rate-Limit für Abruf (je IP) und Erstellen (je Nutzer)', async () => {
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await open(ID2)).statusCode;
    expect(last).toBe(429);
    expect((await open(ID2, '10.0.0.9')).statusCode).toBe(404);
    let created = 0;
    for (let i = 0; i < 21; i++) created = (await create({ id: `${'C'.repeat(21)}${String.fromCharCode(97 + i)}`, ciphertext: 'x' }, 'viel')).statusCode;
    expect(created).toBe(429);
  });

  it('EXP-22: kein Body-Logging; Chiffretext und Schlüssel aus dem Fragment erscheinen nie im Log', async () => {
    const marker = 'STBMARKERCIPHERTEXT';
    await create({ ciphertext: marker });
    // Ein Browser sendet das Fragment (#k=…) nie mit; die Anfrage enthält nur die ID
    await open();
    expect(logs).toContain('/api/v1/shares');
    expect(logs).not.toContain(marker);
    expect(logs).not.toContain(KEY);
    expect(logs).not.toContain('#k=');
  });

  it('EXP-22: Migration 10 auf einer alten Datenbank (Schema 9) behält Daten und legt shares an', () => {
    const old = openDatabase(':memory:');
    migrate(old);
    old.exec('DROP TABLE shares');
    // Migrationen 11 (Schlüsselepoche) und 12 (can_edit_templates) rückgängig, damit sie auf der alten Datenbank erneut läuft
    old.exec('ALTER TABLE diaries DROP COLUMN key_epoch; ALTER TABLE diaries DROP COLUMN rotation_from; ALTER TABLE diaries DROP COLUMN prev_dk_wrap; ALTER TABLE records DROP COLUMN key_epoch; ALTER TABLE blobs DROP COLUMN key_epoch; ALTER TABLE memberships DROP COLUMN can_edit_templates');
    old.pragma('user_version = 9');
    old.prepare("INSERT INTO users (id, username, created_at) VALUES ('u1', 'alt', 1)").run();
    migrate(old);
    expect(old.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(10);
    expect(old.prepare("SELECT username FROM users WHERE id = 'u1'").get()).toEqual({ username: 'alt' });
    expect(old.prepare('SELECT COUNT(*) AS n FROM shares').get()).toEqual({ n: 0 });
    old.close();
  });
});
