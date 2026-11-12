import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StbDb } from '../data/db.js';
import { createLocalAccount, unlockLocal, recoverWithBackupCode, hasAccount, loadAccount } from './local-account.js';
import { unlockWithPasskey, preparePasskeyRequest, PRF_SALT_UMK, type CredentialsLike } from './passkey.js';

let db: StbDb;
let n = 0;
beforeEach(async () => {
  db = new StbDb(`stb-v3-account-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
const prf = (b: number) => new Uint8Array(32).fill(b);
const now = () => 1_700_000_000_000;

describe('Lokales Konto', () => {
  it('Anlegen mit Passkey-PRF: Entsperren mit Passkey und mit Backup-Code liefert dieselbe UMK; gespeichert sind nur Wraps', async () => {
    const { umk, backupCode } = await createLocalAccount(db, { factor: { kind: 'passkey', prf: prf(1) }, credentialId: 'cred-1', now });
    expect(await hasAccount(db)).toBe(true);
    expect(await raw(await unlockLocal(db, { kind: 'passkey', prf: prf(1) }))).toEqual(await raw(umk));
    expect(await raw(await unlockLocal(db, { kind: 'backup', code: backupCode.toLowerCase() }))).toEqual(await raw(umk));
    const stored = JSON.stringify(await loadAccount(db));
    expect(stored).not.toContain(backupCode);
    expect((await loadAccount(db))?.passkey).toEqual({ credentialId: 'cred-1' });
  });

  it('Anlegen mit Passwort; falsches Passwort → unwrap-failed, Tippfehler im Backup-Code → wrong-backup-code', async () => {
    const { backupCode } = await createLocalAccount(db, { factor: { kind: 'password', password: 'geheim lang genug' }, now });
    await expect(unlockLocal(db, { kind: 'password', password: 'falsch' })).rejects.toMatchObject({ code: 'unwrap-failed' });
    const typo = (backupCode[0] === 'A' ? 'B' : 'A') + backupCode.slice(1);
    await expect(unlockLocal(db, { kind: 'backup', code: typo })).rejects.toMatchObject({ code: 'wrong-backup-code' });
    await expect(unlockLocal(db, { kind: 'passkey', prf: prf(1) })).rejects.toMatchObject({ code: 'unwrap-failed' });
  });

  it('nur ein Konto pro Gerät', async () => {
    await createLocalAccount(db, { factor: { kind: 'password', password: 'x1234567' }, now });
    await expect(createLocalAccount(db, { factor: { kind: 'password', password: 'y1234567' }, now })).rejects.toThrow();
  });

  it('Recovery: Backup-Code → neuer Faktor + neuer Backup-Code; alter Passkey und alter Code sind ungültig', async () => {
    const first = await createLocalAccount(db, { factor: { kind: 'passkey', prf: prf(1) }, credentialId: 'alt', now });
    const rec = await recoverWithBackupCode(db, { backupCode: first.backupCode, newFactor: { kind: 'passkey', prf: prf(2) }, credentialId: 'neu' });
    expect(rec.backupCode).not.toBe(first.backupCode);
    expect(await raw(rec.umk)).toEqual(await raw(first.umk));
    expect(await raw(await unlockLocal(db, { kind: 'passkey', prf: prf(2) }))).toEqual(await raw(first.umk));
    await expect(unlockLocal(db, { kind: 'passkey', prf: prf(1) })).rejects.toMatchObject({ code: 'unwrap-failed' });
    await expect(unlockLocal(db, { kind: 'backup', code: first.backupCode })).rejects.toMatchObject({ code: 'unwrap-failed' });
    expect(await raw(await unlockLocal(db, { kind: 'backup', code: rec.backupCode }))).toEqual(await raw(first.umk));
    expect((await loadAccount(db))?.passkey).toEqual({ credentialId: 'neu' });
  });
});

describe('Passkey-Klick-Handler', () => {
  it('ruft credentials.get synchron auf — kein await zwischen Klick und Aufruf (iOS-Nutzergeste)', async () => {
    const prepared = preparePasskeyRequest({ rpId: 'localhost', credentialIds: ['AAEC'] });
    const get = vi.fn(async () => ({ getClientExtensionResults: () => ({ prf: { results: { first: prf(9).buffer } } }) }) as unknown as Credential);
    const credentials: CredentialsLike = { create: vi.fn(), get };
    const p = unlockWithPasskey(credentials, prepared);
    expect(get).toHaveBeenCalledTimes(1); // synchron, vor jedem Microtask
    expect(get.mock.calls[0]?.[0]).toBe(prepared);
    expect(await p).toEqual(prf(9));
    const ext = (prepared.publicKey?.extensions as { prf: { eval: { first: Uint8Array } } }).prf.eval.first;
    expect(ext).toEqual(PRF_SALT_UMK);
  });

  it('fehlende PRF-Ausgabe → prf-unsupported', async () => {
    const credentials: CredentialsLike = { create: vi.fn(), get: async () => ({ getClientExtensionResults: () => ({}) }) as unknown as Credential };
    await expect(unlockWithPasskey(credentials, preparePasskeyRequest({ rpId: 'x', credentialIds: [] }))).rejects.toThrow('prf-unsupported');
  });
});
