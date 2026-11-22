import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StbDb } from '../data/db.js';
import {
  createLocalAccount, unlockLocal, recoverWithBackupCode, hasAccount, loadAccount, setPassword, addPasskey, removePasskey, prepareBackupCodeRenewal, factorInfo,
} from './local-account.js';
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
  it('CRY-09: ruft credentials.get synchron auf — kein await zwischen Klick und Aufruf (iOS-Nutzergeste)', async () => {
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

describe('Faktorverwaltung (local-only)', () => {
  it('CRY-18: Passwort ändern — alter Passwort-Wrap ungültig, neuer entsperrt dieselbe UMK, Backup-Code unverändert', async () => {
    const { umk, backupCode } = await createLocalAccount(db, { factor: { kind: 'password', password: 'altes passwort 1' }, now });
    await setPassword(db, umk, 'neues passwort 2');
    await expect(unlockLocal(db, { kind: 'password', password: 'altes passwort 1' })).rejects.toMatchObject({ code: 'unwrap-failed' });
    expect(await raw(await unlockLocal(db, { kind: 'password', password: 'neues passwort 2' }))).toEqual(await raw(umk));
    expect(await raw(await unlockLocal(db, { kind: 'backup', code: backupCode }))).toEqual(await raw(umk));
    expect((await loadAccount(db))?.wraps.filter((w) => w.factor === 'password')).toHaveLength(1);
  });

  it('CRY-18: Passkey hinzufügen und entfernen — nur mit bleibendem Passwort; allein als Faktor nicht entfernbar', async () => {
    const { umk } = await createLocalAccount(db, { factor: { kind: 'password', password: 'passwort eins 1' }, now });
    await addPasskey(db, umk, { prf: prf(5), credentialId: 'cred-5' });
    expect(await raw(await unlockLocal(db, { kind: 'passkey', prf: prf(5) }))).toEqual(await raw(umk));
    expect((await loadAccount(db))?.passkey).toEqual({ credentialId: 'cred-5' });
    expect(await factorInfo(db)).toMatchObject({ hasPassword: true, hasPasskey: true });
    await removePasskey(db);
    await expect(unlockLocal(db, { kind: 'passkey', prf: prf(5) })).rejects.toMatchObject({ code: 'unwrap-failed' });
    expect((await loadAccount(db))?.passkey).toBeUndefined();
    expect(await raw(await unlockLocal(db, { kind: 'password', password: 'passwort eins 1' }))).toEqual(await raw(umk));

    const only = new StbDb(`stb-v3-account-only-${n}`);
    await only.open();
    try {
      const a = await createLocalAccount(only, { factor: { kind: 'passkey', prf: prf(7) }, credentialId: 'cred-7', now });
      await expect(removePasskey(only)).rejects.toMatchObject({ code: 'last-factor' });
      expect(await raw(await unlockLocal(only, { kind: 'passkey', prf: prf(7) }))).toEqual(await raw(a.umk));
    } finally {
      only.close();
      await only.delete();
    }
  });

  it('CRY-18: Backup-Code erneuern — erst nach commit() gilt der neue Code, der alte wird ungültig', async () => {
    const { umk, backupCode: oldCode } = await createLocalAccount(db, { factor: { kind: 'password', password: 'passwort eins 1' }, now });
    const pending = await prepareBackupCodeRenewal(db, umk);
    expect(pending.backupCode).not.toBe(oldCode);
    // vor der Bestätigung gilt noch der alte Code
    expect(await raw(await unlockLocal(db, { kind: 'backup', code: oldCode }))).toEqual(await raw(umk));
    await pending.commit();
    await expect(unlockLocal(db, { kind: 'backup', code: oldCode })).rejects.toMatchObject({ code: 'unwrap-failed' });
    expect(await raw(await unlockLocal(db, { kind: 'backup', code: pending.backupCode }))).toEqual(await raw(umk));
    expect(await raw(await unlockLocal(db, { kind: 'password', password: 'passwort eins 1' }))).toEqual(await raw(umk));
  });
});
