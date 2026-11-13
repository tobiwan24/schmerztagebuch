import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';

const D = 'diary-1';
const as = (user: string) => ({ [TEST_AUTH_HEADER]: user, 'content-type': 'text/plain' });

let db: Db;
let app: FastifyInstance;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stb-blobs-'));
  db = openDatabase(':memory:');
  migrate(db);
  db.prepare("INSERT INTO diaries (id, created_at) VALUES (?, 0), ('diary-2', 0)").run(D);
  db.prepare(
    "INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'olga', 'owner', 1, 'w', 0), (?, 'ed', 'editor', 1, 'w', 0), (?, 'vic', 'viewer', 1, 'w', 0), ('diary-2', 'mallory', 'owner', 1, 'w', 0)",
  ).run(D, D, D);
  const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: dir, port: 0, host: '127.0.0.1' };
  app = buildApp({ config, db, auth: headerAuth, now: () => 1_700_000_000_000 });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const put = (id: string, body: string, user = 'olga', diaryId = D) => app.inject({ method: 'PUT', url: `/api/v1/blobs/${id}?diaryId=${diaryId}`, headers: as(user), payload: body });
const get = (id: string, user = 'olga') => app.inject({ method: 'GET', url: `/api/v1/blobs/${id}`, headers: { [TEST_AUTH_HEADER]: user } });

describe('Blobs (verschlüsselte Anhänge)', () => {
  it('speichert Chiffretext als Datei und liefert ihn Mitgliedern zurück; erneutes PUT ist ein No-op', async () => {
    const ct = 'AQAAAAF' + 'x'.repeat(5000) + '_-';
    const r = await put('att-1', ct);
    expect(r.statusCode).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(readdirSync(join(dir, D))).toEqual(['att-1']);
    expect(db.prepare('SELECT diary_id, size FROM blobs WHERE id = ?').get('att-1')).toEqual({ diary_id: D, size: ct.length });
    for (const user of ['olga', 'ed', 'vic']) {
      const g = await get('att-1', user);
      expect(g.statusCode).toBe(200);
      expect(g.body).toBe(ct);
    }
    expect((await put('att-1', ct)).statusCode).toBe(200);
    expect((await put('att-2', ct, 'ed')).statusCode).toBe(201);
  });

  it('Rollen und Mitgliedschaft: Viewer darf nicht schreiben, Fremde sehen nichts, ID in anderem Tagebuch → 409', async () => {
    expect((await put('att-1', 'abc', 'vic')).statusCode).toBe(403);
    expect((await put('att-1', 'abc', 'mallory')).statusCode).toBe(403);
    expect((await put('att-1', 'abc')).statusCode).toBe(201);
    expect((await get('att-1', 'mallory')).statusCode).toBe(404);
    expect((await get('unbekannt')).statusCode).toBe(404);
    expect((await put('att-1', 'abc', 'mallory', 'diary-2')).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: '/api/v1/blobs/att-1' })).statusCode).toBe(401);
  });

  it('lehnt ungültige IDs und Nicht-Chiffretext ab', async () => {
    expect((await put('..%2Fetc', 'abc')).statusCode).toBe(400);
    expect((await put('att-1', 'kein base64url!')).statusCode).toBe(400);
    expect((await put('att-1', '')).statusCode).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });
});
