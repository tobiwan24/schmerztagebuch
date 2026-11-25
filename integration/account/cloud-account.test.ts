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
import { createCloudDiary, loginOnNewDevice, openDiaryKeys, prepareCloudBackupCodeRenewal, prepareCloudRecovery, prepareCloudRegistration, startCloudRecovery } from '../../apps/web/src/auth/cloud-account.js';
import { discardLocalKeys, loadDevices } from '../../apps/web/src/auth/devices.js';
import { createCryptoSession } from '../../apps/web/src/data/crypto-session.js';
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
  async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<T> {
    const res = await app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload === undefined ? {} : { payload: payload as object }) });
    const set = res.headers['set-cookie'];
    if (set) cookie = String(set).split(';')[0]!;
    if (res.statusCode >= 400) throw new AccountApiError((res.json() as { error?: string }).error ?? `http-${res.statusCode}`, res.statusCode);
    return (res.statusCode === 204 ? undefined : res.json()) as T;
  }
  return {
    cookie: () => cookie,
    registerOptions: (username, userId) => call('POST', '/api/v1/auth/register/options', userId ? { username, userId } : { username }),
    registerVerify: (body) => call('POST', '/api/v1/auth/register/verify', body),
    loginOptions: () => call('POST', '/api/v1/auth/login/options', {}),
    loginVerify: (body) => call('POST', '/api/v1/auth/login/verify', body),
    recoveryStart: (body) => call('POST', '/api/v1/auth/recovery/start', body),
    recoveryFinish: (body) => call('POST', '/api/v1/auth/recovery/finish', body),
    renewBackupCode: (body) => call('PUT', '/api/v1/auth/backup-code', body),
    createDiary: (body) => call('POST', '/api/v1/diaries', body),
    listDiaries: () => call('GET', '/api/v1/diaries'),
    me: () => call('GET', '/api/v1/auth/me'),
    listDevices: () => call('GET', '/api/v1/devices'),
    revokeDevice: (id) => call('DELETE', `/api/v1/devices/${encodeURIComponent(id)}`),
    logout: () => call('POST', '/api/v1/auth/logout', {}),
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
    expect(apiA.cookie()).toMatch(/^stb3_session=/);
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

  it('Gerät hinzufügen per Backup-Code: neues Gerät mit eigenem Passkey öffnet denselben DK; neuer Backup-Code ersetzt den alten', async () => {
    const { app } = await server();
    const apiA = injectApi(app);
    const dbA = await localDb();
    const passkeyA = createSoftAuthenticator();
    const { challengeId, options } = await apiA.registerOptions('carla');
    const credential = passkeyA.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id }) as CredentialJson;
    const reg = await prepareCloudRegistration(dbA, apiA, { challengeId, username: 'carla', credential, prf: crypto.getRandomValues(new Uint8Array(32)), now });
    await reg.commit();
    const diaryId = '0190a1b2-0000-7000-8000-00000000d002';
    const dkA = await createCloudDiary(dbA, apiA, reg.account, diaryId);

    const apiB = injectApi(app);
    const dbB = await localDb();
    await expect(startCloudRecovery(apiB, { username: 'carla', backupCode: reg.backupCode.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) }))
      .rejects.toMatchObject({ code: expect.stringMatching(/wrong-backup-code/) });
    const start = await startCloudRecovery(apiB, { username: 'carla', backupCode: reg.backupCode });
    const passkeyB = createSoftAuthenticator();
    const credB = passkeyB.register({ challenge: start.options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: start.options.user.id }) as CredentialJson;
    const prfB = crypto.getRandomValues(new Uint8Array(32));
    const rec = await prepareCloudRecovery(dbB, apiB, { username: 'carla', backupCode: reg.backupCode, start, credential: credB, prf: prfB, now });
    expect(rec.backupCode).not.toBe(reg.backupCode);
    await rec.commit();
    const [openedB] = await openDiaryKeys(dbB, rec.account, rec.umk);
    expect(await raw(openedB!.key)).toEqual(await raw(dkA));
    expect(await raw(await unlockLocal(dbB, { kind: 'passkey', prf: prfB }))).toEqual(await raw(rec.umk));

    // alter Backup-Code gilt nicht mehr
    await expect(startCloudRecovery(injectApi(app), { username: 'carla', backupCode: reg.backupCode })).rejects.toMatchObject({ code: 'wrong-backup-code' });
  });

  it('CRY-18: Backup-Code im Konto erneuern ersetzt Wrap und Verifier auf Server und Gerät; der alte Code gilt nirgends mehr, der neue überall', async () => {
    const { app } = await server();
    const apiA = injectApi(app);
    const dbA = await localDb();
    const passkey = createSoftAuthenticator();
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const { challengeId, options } = await apiA.registerOptions('dora');
    const credential = passkey.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id }) as CredentialJson;
    const reg = await prepareCloudRegistration(dbA, apiA, { challengeId, username: 'dora', credential, prf, now });
    await reg.commit();

    const renewal = await prepareCloudBackupCodeRenewal(dbA, apiA, reg.umk);
    expect(renewal.backupCode).not.toBe(reg.backupCode);
    // vor commit() gilt noch der alte Code (Server und Gerät)
    await expect(startCloudRecovery(injectApi(app), { username: 'dora', backupCode: reg.backupCode })).resolves.toBeTruthy();
    await renewal.commit();

    // Server: alter Code abgelehnt, neuer akzeptiert
    await expect(startCloudRecovery(injectApi(app), { username: 'dora', backupCode: reg.backupCode })).rejects.toMatchObject({ code: 'wrong-backup-code' });
    const start = await startCloudRecovery(injectApi(app), { username: 'dora', backupCode: renewal.backupCode });
    // der neue Backup-Wrap auf dem Server entpackt dieselbe UMK
    const backupWrap = JSON.parse(start.keys.find((k) => k.kind === 'umk-wrap-backup')!.blob);
    const { unwrapUmk } = await import('@stb/crypto');
    expect(await raw(await unwrapUmk(backupWrap, { kind: 'backup', code: renewal.backupCode }))).toEqual(await raw(reg.umk));
    // Gerät: alter Code ungültig, neuer und Passkey gültig
    await expect(unlockLocal(dbA, { kind: 'backup', code: reg.backupCode })).rejects.toMatchObject({ code: 'unwrap-failed' });
    expect(await raw(await unlockLocal(dbA, { kind: 'backup', code: renewal.backupCode }))).toEqual(await raw(reg.umk));
    expect(await raw(await unlockLocal(dbA, { kind: 'passkey', prf }))).toEqual(await raw(reg.umk));
  });

  it('CRY-19: Geräteliste mit „dieses Gerät“; anderes Gerät sperren beendet dessen Sitzung; Abmelden verwirft Schlüssel und Wraps, Daten bleiben', async () => {
    const { app } = await server();
    const passkey = createSoftAuthenticator();
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const apiA = injectApi(app);
    const dbA = await localDb();
    const { challengeId, options } = await apiA.registerOptions('carla');
    const credential = passkey.register({ challenge: options.challenge, rpId: 'localhost', origin: ORIGIN, userHandle: options.user.id }) as CredentialJson;
    const pending = await prepareCloudRegistration(dbA, apiA, { challengeId, username: 'carla', credential, prf, now });
    await pending.commit();
    await createCloudDiary(dbA, apiA, pending.account, 'diary-a');

    const apiB = injectApi(app);
    const dbB = await localDb();
    const login = await apiB.loginOptions();
    const assertion = passkey.authenticate({ challenge: login.options.challenge, rpId: 'localhost', origin: ORIGIN }) as CredentialJson;
    await loginOnNewDevice(dbB, apiB, { challengeId: login.challengeId, credential: assertion, prf, now });

    const onA = await loadDevices(apiA, pending.umk);
    expect(onA).toHaveLength(2);
    expect(onA.filter((d) => d.current)).toHaveLength(1);
    const own = onA.find((d) => d.current)!;
    const other = onA.find((d) => !d.current)!;
    expect(own.name).toBeTruthy(); // Gerät A hat seinen Namen mit der UMK verschlüsselt
    expect(onA.every((d) => d.revokedAt === null)).toBe(true);

    await apiA.revokeDevice(other.id);
    expect((await loadDevices(apiA, pending.umk)).find((d) => d.id === other.id)!.revokedAt).not.toBeNull();
    await expect(apiB.listDiaries()).rejects.toMatchObject({ status: 401 }); // B ist gesperrt

    const session = createCryptoSession(dbA);
    session.unlock(pending.umk);
    const records = await dbA.records.count();
    await discardLocalKeys(dbA, apiA, session);
    expect(await dbA.keys.get('account')).toBeUndefined();
    expect(await dbA.keys.get('dk:diary-a')).toBeUndefined();
    expect(session.isUnlocked()).toBe(false);
    expect(await dbA.records.count()).toBe(records); // Daten bleiben
    await expect(apiA.me()).rejects.toMatchObject({ status: 401 }); // Serversitzung beendet
  });
});
