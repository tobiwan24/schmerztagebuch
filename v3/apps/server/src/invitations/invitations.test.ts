import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';
import { INVITATION_QR_TTL_MS, INVITATION_TTL_MS } from './service.js';

const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const D = 'diary-1';

let db: Db;
let app: FastifyInstance;
let now = 1_700_000_000_000;

beforeEach(async () => {
  now = 1_700_000_000_000;
  db = openDatabase(':memory:');
  migrate(db);
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
  db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'olga', 'owner', 3, 'w', 0)").run(D);
  db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'ed', 'editor', 3, 'w', 0)").run(D);
  app = buildApp({ config, db, auth: headerAuth, now: () => now });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

const as = (user: string) => ({ [TEST_AUTH_HEADER]: user });
const create = (user = 'olga', role = 'editor') =>
  app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/invitations`, headers: as(user), payload: { role, ciphertext: 'ct-name-rolle' } });
const fetchInv = (id: string) => app.inject({ method: 'GET', url: `/api/v1/invitations/${id}` });
const accept = (id: string, user: string) =>
  app.inject({ method: 'POST', url: `/api/v1/invitations/${id}/accept`, headers: as(user), payload: { identityPub: `pub-${user}`, mac: `mac-${user}` } });
const revoke = (id: string, user = 'olga') => app.inject({ method: 'DELETE', url: `/api/v1/invitations/${id}`, headers: as(user) });

async function newInvitation(): Promise<string> {
  const r = await create();
  expect(r.statusCode).toBe(201);
  return (r.json() as { id: string }).id;
}

describe('Einladungen', () => {
  it('SHR-08: nur owner legt Einladungen an; Abruf ohne Auth liefert Chiffretext, nie das secret', async () => {
    expect((await create('ed')).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/invitations`, payload: { role: 'editor', ciphertext: 'x' } })).statusCode).toBe(401);
    expect((await create('olga', 'owner')).statusCode).toBe(400);
    const id = await newInvitation();
    const r = await fetchInv(id);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ id, diaryId: D, ciphertext: 'ct-name-rolle', expiresAt: now + INVITATION_TTL_MS });
  });

  it('SHR-08: nach erster Annahme nicht mehr annehmbar', async () => {
    const id = await newInvitation();
    expect((await accept(id, 'bob')).statusCode).toBe(204);
    expect((await accept(id, 'carl')).statusCode).toBe(410);
    expect((await accept(id, 'bob')).statusCode).toBe(410);
    expect((await fetchInv(id)).statusCode).toBe(410);
  });

  it('SHR-08: nach Ablauf (7 Tage) nicht mehr annehmbar', async () => {
    const id = await newInvitation();
    now += INVITATION_TTL_MS - 1;
    expect((await fetchInv(id)).statusCode).toBe(200);
    now += 2;
    expect((await accept(id, 'bob')).statusCode).toBe(410);
    expect((await fetchInv(id)).statusCode).toBe(410);
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('SHR-17: QR-Einladung (kind qr) läuft nach 10 Minuten ab, Link-Einladung gilt weiter; unbekannte Art → 400', async () => {
    const qr = await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/invitations`, headers: as('olga'), payload: { role: 'viewer', ciphertext: 'ct', kind: 'qr' } });
    expect(qr.statusCode).toBe(201);
    expect((qr.json() as { expiresAt: number }).expiresAt).toBe(now + INVITATION_QR_TTL_MS);
    const qrId = (qr.json() as { id: string }).id;
    const linkId = await newInvitation();
    now += INVITATION_QR_TTL_MS + 1;
    expect((await fetchInv(qrId)).statusCode).toBe(410);
    expect((await accept(qrId, 'bob')).statusCode).toBe(410);
    expect((await fetchInv(linkId)).statusCode).toBe(200);
    expect(INVITATION_QR_TTL_MS).toBe(10 * 60 * 1000);
    const bad = await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/invitations`, headers: as('olga'), payload: { role: 'viewer', ciphertext: 'ct', kind: 'sms' } });
    expect(bad.statusCode).toBe(400);
  });

  it('SHR-08: nach Widerruf nicht mehr annehmbar; widerrufen darf nur ein owner', async () => {
    const id = await newInvitation();
    expect((await revoke(id, 'ed')).statusCode).toBe(403);
    expect((await revoke(id)).statusCode).toBe(204);
    expect((await accept(id, 'bob')).statusCode).toBe(410);
    expect((await fetchInv(id)).statusCode).toBe(410);
  });

  it('SHR-08: öffentlicher Abruf ist pro IP rate-limited', async () => {
    const id = await newInvitation();
    for (let i = 0; i < 30; i++) expect((await fetchInv(id)).statusCode).toBe(200);
    expect((await fetchInv(id)).statusCode).toBe(429);
  });

  it('SHR-08: unbekannte Einladung → 404; bestehendes Mitglied kann nicht annehmen', async () => {
    expect((await fetchInv('gibt-es-nicht')).statusCode).toBe(404);
    expect((await accept('gibt-es-nicht', 'bob')).statusCode).toBe(404);
    const id = await newInvitation();
    expect((await accept(id, 'ed')).statusCode).toBe(409);
    expect((await accept(id, 'bob')).statusCode).toBe(204);
  });

  it('SHR-08: Owner sieht angenommene Einladung und bestätigt sie mit wrapped_dk → Mitgliedschaft (Rolle, key_epoch)', async () => {
    const id = await newInvitation();
    await accept(id, 'bob');
    const pending = await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/invitations`, headers: as('olga') });
    expect(pending.json()).toEqual([{ id, role: 'editor', acceptedBy: 'bob', identityPub: 'pub-bob', mac: 'mac-bob' }]);
    expect((await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/invitations`, headers: as('ed') })).statusCode).toBe(403);

    const confirm = (user: string) =>
      app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/members`, headers: as(user), payload: { invitationId: id, wrappedDk: 'wrap-for-bob' } });
    expect((await confirm('ed')).statusCode).toBe(403);
    expect((await confirm('olga')).statusCode).toBe(201);
    expect(db.prepare('SELECT role, key_epoch, wrapped_dk FROM memberships WHERE principal_id = ?').get('bob')).toEqual({ role: 'editor', key_epoch: 3, wrapped_dk: 'wrap-for-bob' });
    expect((await confirm('olga')).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${D}`, headers: as('bob') })).statusCode).toBe(200);
  });

  it('SHR-08: nicht angenommene Einladung kann nicht bestätigt werden', async () => {
    const id = await newInvitation();
    const r = await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/members`, headers: as('olga'), payload: { invitationId: id, wrappedDk: 'w' } });
    expect(r.statusCode).toBe(409);
  });
});
