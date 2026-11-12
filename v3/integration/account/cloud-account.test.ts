// Konto „Mit Konto" Ende-zu-Ende ohne Browser: Web-Kontologik (fake-indexeddb) gegen den echten Server (fastify.inject,
// Sitzungs-Cookie), Passkey per Software-Authenticator mit echter WebAuthn-Verifikation.
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase } from '../../apps/server/src/db.js';
import { migrate } from '../../apps/server/src/schema.js';
import { buildApp } from '../../apps/server/src/app.js';
import { sessionAuth } from '../../apps/server/src/auth/sessions.js';
import { createSoftAuthenticator } from '../../apps/server/src/auth/soft-authenticator.js';
import { StbDb } from '../../apps/web/src/data/db.js';
import { AccountApiError, type AccountApi, type CredentialJson } from '../../apps/web/src/auth/account-api.js';
import { createCloudDiary, loginOnNewDevice, openDiaryKeys, prepareCloudRegistration } from '../../apps/web/src/auth/cloud-account.js';
import { unlockLocal } from '../../apps/web/src/auth/local-account.js';

const ORIGIN = 'http://localhost:4173';
const config = { rpId: 'localhost', allowedOrigins: [ORIGIN], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function server() {
  const db = openDatabase(':memory:');
  migrate(db);
  const app = buildApp({ config, db, auth: sessionAuth(db, () => Date.now()) });
  await app.ready();
  closers.push(async () => (await app.close(), db.close()));
  return { app, db };
}

/** AccountApi über fastify.inject mit eigenem Cookie-Speicher (ein Gerät = ein Browser). */
function injectApi(app: FastifyInstance): AccountApi & { cookie: () => string } {
  let cookie = '';
  async function call<T>(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const res = await app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload === undefined ? {} : { payload: payload as object }) });
    const set = res.headers['set-cookie'];
    if (set) cookie = String(set).split(';')[0]!;
    if (res.statusCode >= 400) throw new AccountApiError((res.json() as { error?: string }).error ?? `http-${res.statusCode}`, res.statusCode);
    return (res.statusCode === 204 ? undefined : res.json()) as T;
  }
  return {
    cookie: () => cookie,
    registerOptions: (username) => call('POST', '/api/v1/auth/register/options', { username }),
    registerVerify: (body) => call('POST', '/api/v1/auth/register/verify', body),
    loginOptions: () => call('POST', '/api/v1/auth/login/options', {}),
    loginVerify: (body) => call('POST', '/api/v1/auth/login/verify', body),
    createDiary: (body) => call('POST', '/api/v1/diaries', body),
    listDiaries: () => call('GET', '/api/v1/diaries'),
  };
}

let n = 0;
async function localDb() {
  const db = new StbDb(`stb-v3-cloud-${++n}`);
  await db.open();
  closers.push(async () => (db.close(), await db.delete()));
  return db;
}

const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
const now = () => Date.now();

describe('Konto „Mit Konto"', () => {
  it('Registrierung + Tagebuch auf Gerät A; Login mit demselben Passkey auf Gerät B öffnet denselben DK', async () => {
    const { app, db: sdb } = await server();
    const passkey = createSoftAuthenticator();
    const prf = crypto.getRandomValues(new Uint8Array(32)); // PRF-Ausgabe des Passkeys (gleich auf allen Geräten)

    // Gerät A
    const apiA = injectApi(app);
    const dbA = await localDb();
    const { challengeId, options } = await apiA.registerOptions('anna');
    const credential = passkey.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id }) as CredentialJson;
    const pending = await prepareCloudRegistration(dbA, apiA, { challengeId, username: 'anna', credential, prf, now });
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 }); // erst nach Bestätigung des Backup-Codes
    await pending.commit();
    expect(apiA.cookie()).toMatch(/^stb_session=/);
    const diaryId = '0190a1b2-0000-7000-8000-00000000d001';
    const dkA = await createCloudDiary(dbA, apiA, pending.account, diaryId);
    const [openedA] = await openDiaryKeys(dbA, pending.account, pending.umk);
    expect(await raw(openedA!.key)).toEqual(await raw(dkA));

    // Server kennt nur Wraps — kein Klartext-Schlüssel
    const stored = JSON.stringify(sdb.prepare('SELECT * FROM user_keys').all()) + JSON.stringify(sdb.prepare('SELECT * FROM memberships').all());
    expect(stored).not.toContain(Buffer.from(await raw(dkA)).toString('base64url'));

    // Gerät B: Login mit demselben (synchronisierten) Passkey
    const apiB = injectApi(app);
    const dbB = await localDb();
    const login = await apiB.loginOptions();
    const assertion = passkey.authenticate({ challenge: login.options.challenge, rpId: 'localhost', origin: ORIGIN }) as CredentialJson;
    const { umk, account } = await loginOnNewDevice(dbB, apiB, { challengeId: login.challengeId, credential: assertion, prf, now });
    const [openedB] = await openDiaryKeys(dbB, account, umk);
    expect(openedB!.diaryId).toBe(diaryId);
    expect(await raw(openedB!.key)).toEqual(await raw(dkA));

    // Lokales Entsperren auf B danach ohne Server (gleicher PRF) und per Backup-Code
    expect(await raw(await unlockLocal(dbB, { kind: 'passkey', prf }))).toEqual(await raw(umk));
    expect(await raw(await unlockLocal(dbB, { kind: 'backup', code: pending.backupCode }))).toEqual(await raw(umk));
  });

  it('falsche PRF-Ausgabe beim Login → unwrap-failed, kein Konto auf dem Gerät', async () => {
    const { app } = await server();
    const passkey = createSoftAuthenticator();
    const apiA = injectApi(app);
    const dbA = await localDb();
    const { challengeId, options } = await apiA.registerOptions('berta');
    const credential = passkey.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id }) as CredentialJson;
    await (await prepareCloudRegistration(dbA, apiA, { challengeId, username: 'berta', credential, prf: crypto.getRandomValues(new Uint8Array(32)), now })).commit();

    const apiB = injectApi(app);
    const dbB = await localDb();
    const login = await apiB.loginOptions();
    const assertion = passkey.authenticate({ challenge: login.options.challenge, rpId: 'localhost', origin: ORIGIN }) as CredentialJson;
    await expect(loginOnNewDevice(dbB, apiB, { challengeId: login.challengeId, credential: assertion, prf: crypto.getRandomValues(new Uint8Array(32)), now }))
      .rejects.toMatchObject({ code: 'unwrap-failed' });
    expect(await dbB.keys.get('account')).toBeUndefined();
  });
});
