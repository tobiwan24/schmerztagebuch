import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { generateIdentityEcdhKeyPair, exportPublicKey, unsealIntake, sealManifest, type IntakeSeal } from '@stb/crypto';
import { buildShortcutBundle, createIdGenerator, instantiateCatalogTemplate, type ShortcutBundle } from '@stb/core';
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

  it('VOI-03: Token eines entfernten oder herabgestuften Erstellers → 401', async () => {
    db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'ed', 'editor', 1, 'w', 0)").run(D);
    const edToken = randomBytes(32).toString('base64url');
    const created = await app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/intake-keys`, headers: as('ed'), payload: { publicKey: await exportPublicKey(intakeKeys.publicKey), tokenHash: sha(edToken) } });
    expect(created.statusCode).toBe(201);
    expect((await send({ text: 'x' }, edToken)).statusCode).toBe(202);
    db.prepare("UPDATE memberships SET role = 'viewer' WHERE principal_id = 'ed'").run();
    expect((await send({ text: 'x' }, edToken)).statusCode).toBe(401);
    db.prepare("UPDATE memberships SET role = 'editor', revoked_at = 1 WHERE principal_id = 'ed'").run();
    expect((await send({ text: 'x' }, edToken)).statusCode).toBe(401);
    expect((await send({ text: 'owner geht weiter' })).statusCode).toBe(202);
  });

  it('VOI-03: Editor darf nur eigene Intake-Schlüssel widerrufen, Owner jeden', async () => {
    db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'ed', 'editor', 1, 'w', 0)").run(D);
    const ownerKey = (db.prepare("SELECT id FROM intake_keys WHERE created_by = 'olga'").get() as { id: string }).id;
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/intake-keys/${ownerKey}`, headers: as('ed') })).statusCode).toBe(404);
    expect((await send({ text: 'x' })).statusCode).toBe(202);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/intake-keys/${ownerKey}`, headers: as('olga') })).statusCode).toBe(204);
  });

  it('VOI-10: Fehlversuche mit beliebigen Tokens werden pro IP begrenzt (kein unbegrenzter Speicher je Fantasie-Token)', async () => {
    for (let i = 0; i < 20; i++) expect((await send({ text: 'x' }, `falsch-${i}`)).statusCode).toBe(401);
    expect((await send({ text: 'x' }, 'falsch-21')).statusCode).toBe(429);
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

describe('Kurzbefehl-Manifest', () => {
  const clock = { now: () => 1_700_000_000_000 };
  const { newId } = createIdGenerator(clock);
  const migraine = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: newId(), order: 'V', newId }, clock);
  const bundle: ShortcutBundle = buildShortcutBundle('STB-MANIFEST-MARKER-Tagebuch', [migraine], migraine.template.id);
  const keyId = () => (db.prepare('SELECT id FROM intake_keys').get() as { id: string }).id;
  const upload = async (t = token, user = 'olga', id = keyId()) =>
    app.inject({
      method: 'PUT', url: `/api/v1/diaries/${D}/intake-keys/${id}/manifest`, headers: as(user),
      payload: { seal: await sealManifest(t, D, new TextEncoder().encode(JSON.stringify(bundle))) },
    });
  const getManifest = (t = token, diaryId = D) => app.inject({ method: 'GET', url: `/api/v1/intake/${diaryId}/manifest`, headers: { authorization: `Bearer ${t}` } });
  const check = (body: unknown, t = token) =>
    app.inject({ method: 'POST', url: `/api/v1/intake/${D}/check`, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, payload: JSON.stringify(body) });
  const dumpAll = () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    return JSON.stringify(tables.map((t) => db.prepare(`SELECT * FROM "${t}"`).all()));
  };

  it('VOI-20: GET manifest → 401 bei falschem, fehlendem oder widerrufenem Token, 404 ohne Upload, 200 mit Manifest', async () => {
    expect((await getManifest('falsch')).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v1/intake/${D}/manifest` })).statusCode).toBe(401);
    const none = await getManifest();
    expect(none.statusCode).toBe(404);
    expect(none.json()).toEqual({ error: 'manifest-missing' });
    expect((await upload()).statusCode).toBe(204);
    const ok = await getManifest();
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.json()).toEqual(bundle.manifest);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/intake-keys/${keyId()}`, headers: as('olga') })).statusCode).toBe(204);
    expect((await getManifest()).statusCode).toBe(401);
    expect((db.prepare('SELECT manifest FROM intake_keys').get() as { manifest: string | null }).manifest).toBeNull();
  });

  it('VOI-20: Upload nur für owner/editor (Editor nur eigener Schlüssel), nur Siegel, ≤ 64 KB, gültige Form', async () => {
    expect((await upload(token, 'vic')).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/diaries/${D}/intake-keys/${keyId()}/manifest` })).statusCode).toBe(401);
    expect((await upload(token, 'olga', 'gibt-es-nicht')).statusCode).toBe(404);
    db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'ed', 'editor', 1, 'w', 0)").run(D);
    expect((await upload(token, 'ed')).statusCode).toBe(404);
    const bad = await app.inject({ method: 'PUT', url: `/api/v1/diaries/${D}/intake-keys/${keyId()}/manifest`, headers: as('olga'), payload: { seal: { v: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(64 * 1024 + 1) } } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/diaries/${D}/intake-keys/${keyId()}/manifest`, headers: as('olga'), payload: { plain: 1 } })).statusCode).toBe(400);
  });

  it('VOI-20: Siegel mit anderem Token ist nicht abrufbar; DB und Log enthalten keinen Klartext-Marker', async () => {
    expect((await upload('anderes-token')).statusCode).toBe(204);
    expect((await getManifest()).statusCode).toBe(404);
    expect((await upload()).statusCode).toBe(204);
    expect((await getManifest()).statusCode).toBe(200);
    expect((await check({ values: { Schmerzstärke: 4 } })).statusCode).toBe(200);
    const dump = dumpAll();
    expect(dump).not.toContain('STB-MANIFEST-MARKER');
    expect(dump).not.toContain(migraine.template.name);
    expect(dump).not.toContain('Begleitsymptome');
    expect(dump).not.toContain(token);
    const log = logs.join('');
    expect(log.length).toBeGreaterThan(0);
    expect(log).not.toContain('STB-MANIFEST-MARKER');
    expect(log).not.toContain('Begleitsymptome');
    expect(log).not.toContain(token);
  });

  it('VOI-21: POST check liefert fehlende und ungültige Felder plus Zusammenfassung und schreibt nichts', async () => {
    expect((await check({ values: {} }, 'falsch')).statusCode).toBe(401);
    expect((await check({ values: {} })).statusCode).toBe(404);
    await upload();
    const before = dumpAll();
    const r = await check({ templateId: migraine.template.id, values: { Schmerzstärke: 11, Begleitsymptome: ['Übelkeit'] } });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { templateId: string; missing: { label: string }[]; invalid: { field: string }[]; summary: string };
    expect(body.templateId).toBe(migraine.template.id);
    expect(body.invalid).toHaveLength(1);
    expect(body.missing.map((f) => f.label)).toContain('Auslöser');
    expect(body.missing.map((f) => f.label)).not.toContain('Begleitsymptome');
    expect(body.summary).toContain('Übelkeit');
    // ohne templateId gilt die Standardvorlage des Manifests
    expect(((await check({ values: { Schmerzstärke: 4 } })).json() as { summary: string }).summary).toContain('Schmerzstärke: 4');
    expect(dumpAll()).toBe(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM intake_items').get()).toEqual({ n: 0 });
  });

  it('VOI-21: unbekannte Vorlage → 404, ungültige Form → 400', async () => {
    await upload();
    expect((await check({ templateId: 'gibt-es-nicht', values: {} })).statusCode).toBe(404);
    expect((await check({ unbekannt: 1 })).statusCode).toBe(400);
  });

  it('VOI-29: POST check mit Zeilen liefert Rückfragen (Kandidaten zuerst), Zusammenfassung, schreibt nichts', async () => {
    await upload();
    const before = dumpAll();
    const r = await check({ templateId: migraine.template.id, lines: 'Diktat: Stärke vier, übel\nSprachmodell: ja\nSchmerzstärke: vier\nBegleitsymptome: Übelkeid' });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { invalid: { candidates?: string[] }[]; questions: { label: string; question: string }[]; summary: string };
    expect(body.invalid[0]!.candidates).toEqual(['Übelkeit']);
    expect(body.questions[0]).toMatchObject({ label: 'Begleitsymptome', question: expect.stringContaining('Meintest du „Übelkeit“?') });
    expect(body.questions.map((q) => q.label)).toContain('Auslöser'); // Standard: alle leeren Felder
    expect(body.summary).toBe('Schmerzstärke: 4.');
    expect(dumpAll()).toBe(before);
  });

  it('VOI-29: Nachfragen-Modus aus dem Manifest; ohne Sprachmodell alle Felder', async () => {
    const req = buildShortcutBundle('T', [migraine], migraine.template.id, 'required');
    await app.inject({ method: 'PUT', url: `/api/v1/diaries/${D}/intake-keys/${keyId()}/manifest`, headers: as('olga'), payload: { seal: await sealManifest(token, D, new TextEncoder().encode(JSON.stringify(req))) } });
    const onlyRequired = (await check({ lines: 'Sprachmodell: ja\nSchmerzstärke: 3' })).json() as { questions: { label: string }[] };
    expect(onlyRequired.questions.map((q) => q.label)).not.toContain('Auslöser');
    const noModel = (await check({ lines: 'Diktat: \nSprachmodell: nein' })).json() as { questions: { label: string }[] };
    expect(noModel.questions.map((q) => q.label)).toContain('Auslöser');
    expect(noModel.questions.map((q) => q.label)).toContain('Schmerzstärke');
  });

  it('VOI-29: tolerant — unbekannte Schlüssel, falsches occurredAt und unpassende Werte werden ignoriert statt 400', async () => {
    await upload();
    const r = await check({ templateId: migraine.template.id, lines: 'Schmerzstärke: 5', occurredAt: '14:30', extra: { a: 1 }, values: { Schmerzstärke: { value: 5, min: 0, max: 10 } } });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { summary: string }).summary).toBe('Schmerzstärke: 5.');
    expect((await send({ lines: 'Schmerzstärke: 5', occurredAt: 'gestern', extra: true })).statusCode).toBe(202);
    expect((await send({ lines: ['Schmerzstärke: 5', 'Notizen: x'] })).statusCode).toBe(202);
  });
});
