// Konto „Mit Konto" (Spec 03 „Registrierung (cloud)", „Gerät hinzufügen"). Krypto wie local-only (UMK, Passkey- und
// Backup-Wrap), zusätzlich Identity-Keypair (Private Key mit UMK verschlüsselt) und DKs als ECDH-Wraps je Tagebuch.
// Der Server sieht nur Wraps und öffentliche Schlüssel. Arbeitet mit WebAuthn-JSON — die Browser-Aufrufe
// (`credentials.create/get`, synchron im Klick) liegen in der UI, damit iOS die Nutzergeste nicht verliert.
import {
  CryptoError, deriveBackupAuth, exportPublicKey, generateBackupCode, generateDiaryKey, generateIdentityEcdhKeyPair, generateUmk, importPublicKey,
  openIdentityKey, sealIdentityKey, toBase64Url, unwrapDkForMember, unwrapUmk, wrapDkForMember, wrapUmk, type SealedIdentity, type UmkWrap,
} from '@stb/crypto';
import type { StbDb } from '../data/db.js';
import { decodeDkWrap, encodeDkWrap, type AccountApi, type CredentialJson, type NewDevice, type UserKey } from './account-api.js';
import type { PendingAccount } from './local-account.js';

const ACCOUNT_ID = 'account';
const dkRowId = (diaryId: string) => `dk:${diaryId}`;

export interface CloudAccount {
  v: 1;
  mode: 'cloud-primary';
  createdAt: string;
  passkey: { credentialId: string };
  wraps: UmkWrap[];
  cloud: { userId: string; username: string; identityPublicKey: string; identitySealed: SealedIdentity };
}

/** Lokal gespeicherter DK-Wrap (gleich dem Server-Wrap) — offline nach dem Entsperren nutzbar. */
interface DkRow {
  diaryId: string;
  keyEpoch: number;
  wrappedDk: string;
}

async function newDevice(umk: CryptoKey): Promise<NewDevice> {
  // Gerätename verschlüsselt (Spec 02 `name_ct`); Geräteschlüssel für spätere Geräte-Funktionen.
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const label = new TextEncoder().encode(globalThis.navigator?.userAgent?.slice(0, 120) || 'Gerät');
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, umk, label));
  const pair = await generateIdentityEcdhKeyPair();
  return { nameCt: `${toBase64Url(iv)}.${toBase64Url(ct)}`, publicKey: await exportPublicKey(pair.publicKey) };
}

/**
 * Nach `credentials.create` (Server-Optionen, PRF): Schlüssel erzeugen. Gespeichert wird erst mit `commit()` — erst dann
 * registriert sich das Konto beim Server und lokal (Backup-Code muss vorher bestätigt sein, CRY-08).
 */
export async function prepareCloudRegistration(
  db: StbDb,
  api: AccountApi,
  input: { challengeId: string; username: string; credential: CredentialJson; prf: Uint8Array<ArrayBuffer>; now: () => number },
): Promise<PendingAccount & { account: CloudAccount }> {
  const umk = await generateUmk();
  const backupCode = await generateBackupCode();
  const passkeyWrap = await wrapUmk(umk, { kind: 'passkey', prf: input.prf });
  const backupWrap = await wrapUmk(umk, { kind: 'backup', code: backupCode });
  const { publicKey, sealed } = await sealIdentityKey(umk, await generateIdentityEcdhKeyPair());
  const credentialId = input.credential.id;
  const keys: UserKey[] = [
    { kind: 'identity-pub', blob: publicKey },
    { kind: 'identity-priv-enc', blob: JSON.stringify(sealed) },
    { kind: 'umk-wrap-passkey', credentialId, blob: JSON.stringify(passkeyWrap) },
    { kind: 'umk-wrap-backup', blob: JSON.stringify(backupWrap) },
    { kind: 'backup-verifier', blob: await deriveBackupAuth(backupCode) },
  ];
  const device = await newDevice(umk);
  const draft: Omit<CloudAccount, 'cloud'> = {
    v: 1, mode: 'cloud-primary', createdAt: new Date(input.now()).toISOString(), passkey: { credentialId }, wraps: [passkeyWrap, backupWrap],
  };
  const account: CloudAccount = { ...draft, cloud: { userId: '', username: input.username, identityPublicKey: publicKey, identitySealed: sealed } };
  return {
    umk,
    backupCode,
    account,
    async commit() {
      if (await db.keys.get(ACCOUNT_ID)) throw new Error('Auf diesem Gerät gibt es bereits ein Konto');
      const r = await api.registerVerify({ challengeId: input.challengeId, username: input.username, response: input.credential, keys, device });
      account.cloud.userId = r.userId;
      await db.keys.put({ id: ACCOUNT_ID, value: account });
    },
  };
}

/** Login auf einem neuen Gerät: Server prüft den Passkey, liefert Wraps → UMK → Konto lokal speichern, DK-Wraps laden. */
export async function loginOnNewDevice(
  db: StbDb,
  api: AccountApi,
  input: { challengeId: string; credential: CredentialJson; prf: Uint8Array<ArrayBuffer>; now: () => number; username?: string },
): Promise<{ umk: CryptoKey; account: CloudAccount }> {
  const tmpUmk = await generateUmk(); // nur für den verschlüsselten Gerätenamen, bis die echte UMK entpackt ist
  const r = await api.loginVerify({ challengeId: input.challengeId, response: input.credential, device: await newDevice(tmpUmk) });
  const get = (kind: UserKey['kind'], credentialId?: string) => r.keys.find((k) => k.kind === kind && (credentialId === undefined || k.credentialId === credentialId));
  const passkey = get('umk-wrap-passkey', input.credential.id);
  const backup = get('umk-wrap-backup');
  const pub = get('identity-pub');
  const priv = get('identity-priv-enc');
  if (!passkey || !backup || !pub || !priv) throw new CryptoError('unwrap-failed', 'Schlüssel zu diesem Passkey fehlen auf dem Server');
  const passkeyWrap = JSON.parse(passkey.blob) as UmkWrap;
  const umk = await unwrapUmk(passkeyWrap, { kind: 'passkey', prf: input.prf });
  const sealed = JSON.parse(priv.blob) as SealedIdentity;
  await openIdentityKey(umk, pub.blob, sealed); // prüft, dass Identity und UMK zusammenpassen
  const account: CloudAccount = {
    v: 1, mode: 'cloud-primary', createdAt: new Date(input.now()).toISOString(), passkey: { credentialId: input.credential.id },
    wraps: [passkeyWrap, JSON.parse(backup.blob) as UmkWrap],
    cloud: { userId: r.userId, username: input.username ?? '', identityPublicKey: pub.blob, identitySealed: sealed },
  };
  await db.keys.put({ id: ACCOUNT_ID, value: account });
  for (const m of await api.listDiaries()) {
    await db.keys.put({ id: dkRowId(m.diaryId), value: { diaryId: m.diaryId, keyEpoch: m.keyEpoch, wrappedDk: m.wrappedDk } satisfies DkRow });
    await db.sync_state.put({ diaryId: m.diaryId, cursor: 0, mode: 'cloud-primary' });
  }
  return { umk, account };
}

/** Recovery / Gerät hinzufügen, Schritt 1: Backup-Code prüfen lassen (nur der abgeleitete Token geht an den Server). */
export async function startCloudRecovery(api: AccountApi, input: { username: string; backupCode: string }) {
  const backupAuth = await deriveBackupAuth(input.backupCode);
  return api.recoveryStart({ username: input.username, backupAuth });
}

/**
 * Schritt 2 nach `credentials.create` (neuer Passkey dieses Geräts): UMK mit dem Backup-Code entpacken, neuen Passkey-Wrap
 * und **neuen** Backup-Code erzeugen (Spec 03 „Recovery"). `commit()` (nach Bestätigung des neuen Codes) meldet beim
 * Server an und speichert das Konto samt DK-Wraps lokal.
 */
export async function prepareCloudRecovery(
  db: StbDb,
  api: AccountApi,
  input: {
    username: string;
    backupCode: string;
    start: Awaited<ReturnType<typeof startCloudRecovery>>;
    credential: CredentialJson;
    prf: Uint8Array<ArrayBuffer>;
    now: () => number;
  },
): Promise<PendingAccount & { account: CloudAccount }> {
  const get = (kind: UserKey['kind']) => input.start.keys.find((k) => k.kind === kind);
  const backup = get('umk-wrap-backup');
  const pub = get('identity-pub');
  const priv = get('identity-priv-enc');
  if (!backup || !pub || !priv) throw new CryptoError('unwrap-failed', 'Schlüssel fehlen auf dem Server');
  const umk = await unwrapUmk(JSON.parse(backup.blob) as UmkWrap, { kind: 'backup', code: input.backupCode });
  const sealed = JSON.parse(priv.blob) as SealedIdentity;
  await openIdentityKey(umk, pub.blob, sealed);
  const backupCode = await generateBackupCode();
  const passkeyWrap = await wrapUmk(umk, { kind: 'passkey', prf: input.prf });
  const backupWrap = await wrapUmk(umk, { kind: 'backup', code: backupCode });
  const keys: UserKey[] = [
    { kind: 'umk-wrap-passkey', credentialId: input.credential.id, blob: JSON.stringify(passkeyWrap) },
    { kind: 'umk-wrap-backup', blob: JSON.stringify(backupWrap) },
    { kind: 'backup-verifier', blob: await deriveBackupAuth(backupCode) },
  ];
  const account: CloudAccount = {
    v: 1, mode: 'cloud-primary', createdAt: new Date(input.now()).toISOString(), passkey: { credentialId: input.credential.id },
    wraps: [passkeyWrap, backupWrap],
    cloud: { userId: '', username: input.username, identityPublicKey: pub.blob, identitySealed: sealed },
  };
  return {
    umk,
    backupCode,
    account,
    async commit() {
      const r = await api.recoveryFinish({ challengeId: input.start.challengeId, response: input.credential, keys, device: await newDevice(umk) });
      account.cloud.userId = r.userId;
      await db.keys.put({ id: ACCOUNT_ID, value: account });
      for (const m of await api.listDiaries()) {
        await db.keys.put({ id: dkRowId(m.diaryId), value: { diaryId: m.diaryId, keyEpoch: m.keyEpoch, wrappedDk: m.wrappedDk } satisfies DkRow });
        await db.sync_state.put({ diaryId: m.diaryId, cursor: 0, mode: 'cloud-primary' });
      }
    },
  };
}

/** Tagebuch auf dem Server anlegen: neuer DK, für die eigene Identity verpackt (Owner, `key_epoch` 1). */
export async function createCloudDiary(db: StbDb, api: AccountApi, account: CloudAccount, diaryId: string): Promise<CryptoKey> {
  const dk = await generateDiaryKey();
  const wrap = await wrapDkForMember(dk, await importPublicKey(account.cloud.identityPublicKey), { diaryId, keyEpoch: 1 });
  const wrappedDk = encodeDkWrap(wrap);
  await api.createDiary({ diaryId, wrappedDk });
  await db.keys.put({ id: dkRowId(diaryId), value: { diaryId, keyEpoch: 1, wrappedDk } satisfies DkRow });
  await db.sync_state.put({ diaryId, cursor: 0, mode: 'cloud-primary' });
  return dk;
}

/** Nach dem Entsperren: alle lokal bekannten DKs mit der Identity öffnen. */
export async function openDiaryKeys(db: StbDb, account: CloudAccount, umk: CryptoKey): Promise<{ diaryId: string; key: CryptoKey; keyEpoch: number }[]> {
  const identity = await openIdentityKey(umk, account.cloud.identityPublicKey, account.cloud.identitySealed);
  const rows = (await db.keys.toArray()).filter((r) => r.id.startsWith('dk:')).map((r) => r.value as DkRow);
  return Promise.all(
    rows.map(async (r) => ({ diaryId: r.diaryId, keyEpoch: r.keyEpoch, key: await unwrapDkForMember(decodeDkWrap(r.wrappedDk), identity, { diaryId: r.diaryId, keyEpoch: r.keyEpoch }) })),
  );
}

export const isCloudAccount = (a: unknown): a is CloudAccount => (a as { mode?: string } | undefined)?.mode === 'cloud-primary';
