import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { createSession, sessionAuth, SESSION_COOKIE, SESSION_TTL_MS, hashToken } from './sessions.js';

const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const D = 'diary-1';

let db: Db;
let app: FastifyInstance;
let now = 1_700_000_000_000;

function seed() {
  db.prepare("INSERT INTO users (id, username, created_at) VALUES ('u1', 'tobi', 0), ('u2', 'eve', 0)").run();
  db.prepare(`INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES
    ('d1', 'u1', 'device', 'n1', 'pk1', 0), ('d2', 'u1', 'device', 'n2', 'pk2', 0), ('d3', 'u2', 'device', 'n3', 'pk3', 0)`).run();
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
  db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'u1', 'owner', 1, 'w', 0)").run(D);
}

beforeEach(async () => {
  now = 1_700_000_000_000;
  db = openDatabase(':memory:');
  migrate(db);
  seed();
  app = buildApp({ config, db, auth: sessionAuth(db, () => now), now: () => now });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

const cookie = (token: string) => ({ cookie: `other=1; ${SESSION_COOKIE}=${token}` });
const pull = (token: string) => app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${D}`, headers: cookie(token) });
const push = (token: string, id: string) =>
  app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: cookie(token), payload: { diaryId: D, ops: [{ recordId: id, kind: 'entry', baseRev: 0, deleted: false, ciphertext: 'ct' }] } });
const revoke = (token: string, deviceId: string) => app.inject({ method: 'DELETE', url: `/api/v1/devices/${deviceId}`, headers: cookie(token) });

describe('Sitzungen und Gerätesperre', () => {
  it('CRY-14: Sitzungs-Cookie ist HttpOnly, Secure, SameSite=Strict, 30 Tage; Server speichert nur den Hash', () => {
    const s = createSession(db, 'u1', 'd1', now);
    expect(s.setCookie).toBe(`${SESSION_COOKIE}=${s.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`);
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    const dump = JSON.stringify(db.prepare('SELECT * FROM sessions').all());
    expect(dump).not.toContain(s.token);
    expect(dump).toContain(hashToken(s.token));
  });

  it('CRY-14: gesperrtes Gerät erhält keine Records mehr und kann nicht mehr pushen; andere Geräte arbeiten weiter', async () => {
    const s1 = createSession(db, 'u1', 'd1', now).token;
    const s2 = createSession(db, 'u1', 'd2', now).token;
    expect((await push(s1, 'e1')).statusCode).toBe(200);
    expect((await pull(s2)).json().records).toHaveLength(1);

    expect((await revoke(s1, 'd2')).statusCode).toBe(204);
    expect((await pull(s2)).statusCode).toBe(401);
    expect((await push(s2, 'e2')).statusCode).toBe(401);
    // Sitzung des gesperrten Geräts ist beendet
    expect(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE device_id = 'd2'").get()).toEqual({ n: 0 });
    // eigenes, nicht gesperrtes Gerät arbeitet weiter
    expect((await pull(s1)).statusCode).toBe(200);
    expect((await push(s1, 'e3')).statusCode).toBe(200);
  });

  it('CRY-14: neue Sitzung für ein gesperrtes Gerät wird nicht akzeptiert', async () => {
    const s1 = createSession(db, 'u1', 'd1', now).token;
    await revoke(s1, 'd2');
    const late = createSession(db, 'u1', 'd2', now).token;
    expect((await pull(late)).statusCode).toBe(401);
  });

  it('CRY-14: fremde Geräte können nicht gesperrt werden; unbekannte → 404', async () => {
    const eve = createSession(db, 'u2', 'd3', now).token;
    expect((await revoke(eve, 'd1')).statusCode).toBe(404);
    expect((await revoke(eve, 'nope')).statusCode).toBe(404);
    expect(db.prepare("SELECT revoked_at FROM devices WHERE id = 'd1'").get()).toEqual({ revoked_at: null });
  });

  it('CRY-14: abgelaufene oder unbekannte Sitzung → 401', async () => {
    const s1 = createSession(db, 'u1', 'd1', now).token;
    expect((await pull('falsch')).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${D}` })).statusCode).toBe(401);
    now += SESSION_TTL_MS;
    expect((await pull(s1)).statusCode).toBe(401);
  });

  it('CRY-19: GET /devices listet nur eigene Geräte (verschlüsselter Name, gesperrt-Zeitpunkt), ohne Fremde und ohne Schlüssel', async () => {
    const s1 = createSession(db, 'u1', 'd1', now).token;
    await revoke(s1, 'd2');
    const res = await app.inject({ method: 'GET', url: '/api/v1/devices', headers: cookie(s1) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: 'd1', nameCt: 'n1', createdAt: 0, revokedAt: null },
      { id: 'd2', nameCt: 'n2', createdAt: 0, revokedAt: now },
    ]);
    expect(res.body).not.toContain('pk1');
    expect((await app.inject({ method: 'GET', url: '/api/v1/devices' })).statusCode).toBe(401);
  });
});
