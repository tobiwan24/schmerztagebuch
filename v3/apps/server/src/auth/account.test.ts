import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { sessionAuth } from './sessions.js';
import { createSoftAuthenticator } from './soft-authenticator.js';

const ORIGIN = 'http://localhost:4173';
const config = { rpId: 'localhost', allowedOrigins: [ORIGIN], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const keys = [
  { kind: 'identity-pub', blob: 'pub' },
  { kind: 'identity-priv-enc', blob: 'priv-enc' },
  { kind: 'umk-wrap-passkey', blob: 'wrap-p' },
  { kind: 'umk-wrap-backup', blob: 'wrap-b' },
  { kind: 'backup-verifier', blob: 'backup-auth-token-0000000000000000' },
];
const device = { nameCt: 'name-ct', publicKey: 'dev-pub' };

let db: Db;
let app: FastifyInstance;
const t = 1_700_000_000_000;

beforeEach(async () => {
  db = openDatabase(':memory:');
  migrate(db);
  app = buildApp({ config, db, auth: sessionAuth(db, () => t), now: () => t });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0]!;

async function register(username = 'anna', auth = createSoftAuthenticator()) {
  const opt = await app.inject({ method: 'POST', url: '/api/v1/auth/register/options', payload: { username } });
  expect(opt.statusCode).toBe(200);
  const { challengeId, options } = opt.json<{ challengeId: string; options: { challenge: string; user: { id: string } } }>();
  const response = auth.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id });
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register/verify', payload: { challengeId, username, response, keys, device } });
  return { res, auth };
}

async function login(auth: ReturnType<typeof createSoftAuthenticator>, opts: { userVerified?: boolean; origin?: string } = {}) {
  const opt = await app.inject({ method: 'POST', url: '/api/v1/auth/login/options' });
  const { challengeId, options } = opt.json<{ challengeId: string; options: { challenge: string; userVerification: string } }>();
  expect(options.userVerification).toBe('required');
  const response = auth.authenticate({ challenge: options.challenge, rpId: 'localhost', origin: opts.origin ?? ORIGIN, userVerified: opts.userVerified });
  return app.inject({ method: 'POST', url: '/api/v1/auth/login/verify', payload: { challengeId, response, device } });
}

describe('Konto per Passkey', () => {
  it('Registrierung: Passkey verifiziert, Wraps gespeichert, Sitzung gesetzt; Optionen verlangen residentKey + UV', async () => {
    const opt = await app.inject({ method: 'POST', url: '/api/v1/auth/register/options', payload: { username: 'anna' } });
    expect(opt.json().options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    expect(opt.headers['cache-control']).toBe('no-store');

    const { res } = await register('berta');
    expect(res.statusCode).toBe(201);
    expect(String(res.headers['set-cookie'])).toMatch(/stb_session=.+HttpOnly; Secure; SameSite=Strict/);
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookieOf(res) } });
    expect(me.json()).toMatchObject({ username: 'berta' });
    expect(me.json().keys.map((k: { kind: string }) => k.kind).sort()).toEqual(['identity-priv-enc', 'identity-pub', 'umk-wrap-backup', 'umk-wrap-passkey']);
    // Verifier nur als Hash und nie an den Client
    expect(db.prepare("SELECT blob FROM user_keys WHERE kind = 'backup-verifier'").get()).not.toEqual({ blob: 'backup-auth-token-0000000000000000' });
  });

  it('Registrierung ohne Backup-Wrap wird abgelehnt; Benutzername nur einmal; Challenge nur einmal', async () => {
    const auth = createSoftAuthenticator();
    const opt = await app.inject({ method: 'POST', url: '/api/v1/auth/register/options', payload: { username: 'carl' } });
    const { challengeId, options } = opt.json();
    const response = auth.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id });
    const noBackup = await app.inject({
      method: 'POST', url: '/api/v1/auth/register/verify',
      payload: { challengeId, username: 'carl', response, keys: keys.filter((k) => k.kind !== 'umk-wrap-backup'), device },
    });
    expect(noBackup.statusCode).toBe(400);

    expect((await register('dora')).res.statusCode).toBe(201);
    const again = await app.inject({ method: 'POST', url: '/api/v1/auth/register/options', payload: { username: 'dora' } });
    expect(again.statusCode).toBe(409);

    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/register/verify', payload: { challengeId, username: 'carl', response, keys, device } });
    expect(ok.statusCode).toBe(201);
    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/register/verify', payload: { challengeId, username: 'carl2', response, keys, device } });
    expect(replay.json()).toEqual({ error: 'challenge-expired' });
  });

  it('Login: liefert Wraps und neue Sitzung; ohne UV, falsche Origin oder unbekannter Passkey → abgelehnt', async () => {
    const { auth } = await register('emil');
    const res = await login(auth);
    expect(res.statusCode).toBe(200);
    expect(res.json().keys).toHaveLength(4); // ohne Verifier
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookieOf(res) } });
    expect(me.json().username).toBe('emil');

    expect((await login(auth, { userVerified: false })).statusCode).toBe(401);
    expect((await login(auth, { origin: 'https://evil.example' })).statusCode).toBe(401);
    expect((await login(createSoftAuthenticator())).json()).toEqual({ error: 'no-credential' });
  });

  it('Logout beendet die Sitzung; Tagebuch anlegen macht den Nutzer zum Owner mit verpacktem DK', async () => {
    const { res } = await register('frida');
    const cookie = cookieOf(res);
    const created = await app.inject({ method: 'POST', url: '/api/v1/diaries', headers: { cookie }, payload: { diaryId: 'd-1', wrappedDk: 'wdk' } });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/v1/diaries', headers: { cookie }, payload: { diaryId: 'd-1', wrappedDk: 'x' } })).statusCode).toBe(409);
    const list = await app.inject({ method: 'GET', url: '/api/v1/diaries', headers: { cookie } });
    expect(list.json()).toEqual([{ diaryId: 'd-1', role: 'owner', keyEpoch: 1, wrappedDk: 'wdk' }]);

    await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/diaries', payload: { diaryId: 'd-2', wrappedDk: 'w' } })).statusCode).toBe(401);
  });

  it('Rate-Limit auf Auth-Endpunkten', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await app.inject({ method: 'POST', url: '/api/v1/auth/login/options' })).statusCode;
    expect(last).toBe(429);
  });

  it('Recovery: richtiger Backup-Auth-Token → neuer Passkey als zusätzlicher Zugang, Backup-Wrap und Verifier ersetzt', async () => {
    const { res, auth: oldPasskey } = await register('gerd');
    expect(res.statusCode).toBe(201);
    const wrong = await app.inject({ method: 'POST', url: '/api/v1/auth/recovery/start', payload: { username: 'gerd', backupAuth: 'falsch-falsch-falsch-falsch' } });
    expect(wrong.json()).toEqual({ error: 'wrong-backup-code' });
    const unknown = await app.inject({ method: 'POST', url: '/api/v1/auth/recovery/start', payload: { username: 'niemand', backupAuth: 'backup-auth-token-0000000000000000' } });
    expect(unknown.json()).toEqual({ error: 'wrong-backup-code' });

    const start = await app.inject({ method: 'POST', url: '/api/v1/auth/recovery/start', payload: { username: 'gerd', backupAuth: 'backup-auth-token-0000000000000000' } });
    expect(start.statusCode).toBe(200);
    const { challengeId, options, keys: got } = start.json();
    expect(got.map((k: { kind: string }) => k.kind).sort()).toEqual(['identity-priv-enc', 'identity-pub', 'umk-wrap-backup']);
    expect(options.excludeCredentials).toHaveLength(1);

    const fresh = createSoftAuthenticator();
    const response = fresh.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id });
    const finish = await app.inject({
      method: 'POST', url: '/api/v1/auth/recovery/finish',
      payload: {
        challengeId, response, device,
        keys: [
          { kind: 'umk-wrap-passkey', blob: 'wrap-p2' },
          { kind: 'umk-wrap-backup', blob: 'wrap-b2' },
          { kind: 'backup-verifier', blob: 'backup-auth-token-1111111111111111' },
        ],
      },
    });
    expect(finish.statusCode).toBe(201);
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookieOf(finish) } });
    const wraps = me.json().keys as { kind: string; blob: string }[];
    expect(wraps.filter((k) => k.kind === 'umk-wrap-passkey').map((k) => k.blob).sort()).toEqual(['wrap-p', 'wrap-p2']);
    expect(wraps.find((k) => k.kind === 'umk-wrap-backup')?.blob).toBe('wrap-b2');

    // alter Code gilt nicht mehr, neuer schon; alter Passkey funktioniert weiter (zusätzlicher Zugang)
    const old = await app.inject({ method: 'POST', url: '/api/v1/auth/recovery/start', payload: { username: 'gerd', backupAuth: 'backup-auth-token-0000000000000000' } });
    expect(old.json()).toEqual({ error: 'wrong-backup-code' });
    expect((await login(oldPasskey)).statusCode).toBe(200);
    expect((await login(fresh)).statusCode).toBe(200);
  });

  it('Recovery-Rate-Limit: 5 Versuche je Benutzername', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await app.inject({ method: 'POST', url: '/api/v1/auth/recovery/start', payload: { username: 'hans', backupAuth: 'falsch-falsch-falsch-falsch' } })).statusCode;
    }
    expect(last).toBe(429);
  });
});
