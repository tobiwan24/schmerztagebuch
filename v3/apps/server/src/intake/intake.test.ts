import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { generateIdentityEcdhKeyPair, exportPublicKey, unsealIntake, type IntakeSeal } from '@stb/crypto';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';
import { INTAKE_RATE_LIMIT } from './routes.js';

const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const D = 'diary-1';

let db: Db;
let app: FastifyInstance;
let logs: string[];
let now = 1_700_000_000_000;
let intakeKeys: CryptoKeyPair;
let token: string;

const sha = (t: string) => createHash('sha256').update(t).digest('base64url');
const as = (user: string) => ({ [TEST_AUTH_HEADER]: user });

beforeEach(async () => {
  now = 1_700_000_000_000;
  logs = [];
  db = openDatabase(':memory:');
  migrate(db);
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
  db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'olga', 'owner', 1, 'w', 0), (?, 'vic', 'viewer', 1, 'w', 0)").run(D, D);
  const logStream = new Writable({ write(chunk, _enc, cb) { logs.push(String(chunk)); cb(); } });
  app = buildApp({ config, db, auth: headerAuth, now: () => now, logStream });
  await app.ready();
  intakeKeys = await generateIdentityEcdhKeyPair();
  token = randomBytes(32).toString('base64url');
  const r = await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/intake-keys`, headers: as('olga'), payload: { publicKey: await exportPublicKey(intakeKeys.publicKey), tokenHash: sha(token) } });
  expect(r.statusCode).toBe(201);
});
afterEach(async () => {
  await app.close();
  db.close();
});

const send = (body: unknown, t = token, diaryId = D) =>
  app.inject({ method: 'POST', url: `/api/v1/intake/${diaryId}`, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, payload: typeof body === 'string' ? body : JSON.stringify(body) });

describe('Intake-Endpunkt', () => {
  it('VOI-03: gültiges Token → 202', async () => {
    const r = await send({ text: 'Kopfschmerz 6', values: { Schmerz: 6 } });
    expect(r.statusCode).toBe(202);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intake_items').get()).toEqual({ n: 1 });
  });

  it('VOI-03: falsches, fehlendes oder fremdes Token → 401', async () => {
    expect((await send({ text: 'x' }, 'falsch')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/v1/intake/${D}`, payload: { text: 'x' } })).statusCode).toBe(401);
    db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run('diary-2');
    expect((await send({ text: 'x' }, token, 'diary-2')).statusCode).toBe(401);
  });

  it('VOI-03: widerrufenes Token → 401', async () => {
    const keyId = (db.prepare('SELECT id FROM intake_keys').get() as { id: string }).id;
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/intake-keys/${keyId}`, headers: as('olga') })).statusCode).toBe(204);
    expect((await send({ text: 'x' })).statusCode).toBe(401);
  });

  it('VOI-03: Body > 16 KB → 413; ungültige Form → 400', async () => {
    expect((await send({ text: 'x'.repeat(16 * 1024) })).statusCode).toBe(413);
    expect((await send({ text: 'y'.repeat(16 * 1024 - 20) })).statusCode).toBe(202);
    expect((await send({ unbekannt: 1 })).statusCode).toBe(400);
    expect((await send('kein json')).statusCode).toBe(400);
  });

  it('VOI-03: Intake-Schlüssel anlegen/widerrufen nur owner/editor', async () => {
    const payload = { publicKey: await exportPublicKey(intakeKeys.publicKey), tokenHash: sha('t2') };
    expect((await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/intake-keys`, headers: as('vic'), payload })).statusCode).toBe(403);
  });

  it('VOI-04: SQLite-DB und Server-Log enthalten nach einem Intake keinen Klartext-Marker; das Siegel ist für die App lesbar', async () => {
    expect((await send({ text: 'STB-PLAINTEXT-MARKER-7', values: { Notiz: 'STB-PLAINTEXT-MARKER-8' } })).statusCode).toBe(202);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    const dump = JSON.stringify(tables.map((t) => db.prepare(`SELECT * FROM "${t}"`).all()));
    expect(dump).not.toContain('STB-PLAINTEXT-MARKER');
    expect(dump).not.toContain(token);
    expect(logs.length).toBeGreaterThan(0);
    const log = logs.join('');
    expect(log).not.toContain('STB-PLAINTEXT-MARKER');
    expect(log).not.toContain(token);
    const sealed = JSON.parse((db.prepare('SELECT sealed FROM intake_items').get() as { sealed: string }).sealed) as IntakeSeal;
    expect(new TextDecoder().decode(await unsealIntake(sealed, intakeKeys, D))).toContain('STB-PLAINTEXT-MARKER-7');
  });

  it('VOI-10: Rate-Limit greift nach 60 Requests pro Stunde und Token', async () => {
    expect(INTAKE_RATE_LIMIT).toEqual({ limit: 60, windowMs: 60 * 60 * 1000 });
    for (let i = 0; i < 60; i++) expect((await send({ text: `${i}` })).statusCode, `Request ${i + 1}`).toBe(202);
    const blocked = await send({ text: 'zu viel' });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // anderes Token ist unabhängig
    expect((await send({ text: 'x' }, 'anderes-token')).statusCode).toBe(401);
    // nach Ablauf des Fensters wieder erlaubt
    now += 60 * 60 * 1000;
    expect((await send({ text: 'wieder' })).statusCode).toBe(202);
  });
});
