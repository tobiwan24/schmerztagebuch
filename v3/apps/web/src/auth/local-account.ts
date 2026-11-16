// Lokales Konto (Spec 03 „Einrichtung (local-only)", „Recovery"): UMK, verpackt mit dem gewählten Faktor (Passkey-PRF oder
// Passwort) und zusätzlich mit dem Pflicht-Backup-Code. Gespeichert werden nur Wraps (Salt + Chiffretext) in `keys`.
import {
  CryptoError, generateBackupCode, generateUmk, parseBackupCode, unwrapUmk, wrapUmk, type UmkFactor, type UmkWrap,
} from '@stb/crypto';
import type { StbDb } from '../data/db.js';

const ACCOUNT_ID = 'account';

export interface LocalAccount {
  v: 1;
  mode: 'local-only';
  createdAt: string;
  /** Passkey-Credential, falls Faktor = Passkey (zum Vorbereiten von `credentials.get`). */
  passkey?: { credentialId: string };
  wraps: UmkWrap[];
}

export async function loadAccount(db: StbDb): Promise<LocalAccount | undefined> {
  return (await db.keys.get(ACCOUNT_ID))?.value as LocalAccount | undefined;
}

export const hasAccount = async (db: StbDb): Promise<boolean> => (await loadAccount(db)) !== undefined;

async function save(db: StbDb, account: LocalAccount): Promise<void> {
  await db.keys.put({ id: ACCOUNT_ID, value: account });
}

/** Vorbereitetes Konto: liegt nur im Speicher, bis `commit()` nach bestätigtem Backup-Code aufgerufen wird (CRY-08). */
export interface PendingAccount {
  umk: CryptoKey;
  /** Genau einmal angezeigt (und als Datei angeboten), nie gespeichert. */
  backupCode: string;
  commit(): Promise<void>;
}

/** Bereitet das Konto vor. Gespeichert wird erst mit `commit()` — ohne bestätigten Backup-Code entsteht kein Konto. */
export async function prepareLocalAccount(
  db: StbDb,
  input: { factor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string; now: () => number },
): Promise<PendingAccount> {
  if (await hasAccount(db)) throw new Error('Auf diesem Gerät gibt es bereits ein Konto');
  const umk = await generateUmk();
  const backupCode = await generateBackupCode();
  const wraps = [await wrapUmk(umk, input.factor), await wrapUmk(umk, { kind: 'backup', code: backupCode })];
  const account: LocalAccount = {
    v: 1, mode: 'local-only', createdAt: new Date(input.now()).toISOString(), wraps,
    ...(input.credentialId ? { passkey: { credentialId: input.credentialId } } : {}),
  };
  return {
    umk,
    backupCode,
    async commit() {
      if (await hasAccount(db)) throw new Error('Auf diesem Gerät gibt es bereits ein Konto');
      await save(db, account);
    },
  };
}

/** Anlegen in einem Schritt (Tests, Migration): vorbereiten + sofort speichern. */
export async function createLocalAccount(
  db: StbDb,
  input: { factor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string; now: () => number },
): Promise<{ umk: CryptoKey; backupCode: string }> {
  const pending = await prepareLocalAccount(db, input);
  await pending.commit();
  return { umk: pending.umk, backupCode: pending.backupCode };
}

/** Entsperrt mit einem Faktor. Falscher Faktor → `CryptoError('unwrap-failed' | 'wrong-backup-code')`. */
export async function unlockLocal(db: StbDb, factor: UmkFactor): Promise<CryptoKey> {
  const account = await loadAccount(db);
  if (!account) throw new Error('Kein Konto auf diesem Gerät');
  if (factor.kind === 'backup') factor = { kind: 'backup', code: await parseBackupCode(factor.code) };
  const candidates = account.wraps.filter((w) => w.factor === factor.kind);
  for (const w of candidates) {
    try {
      return await unwrapUmk(w, factor);
    } catch {
      // nächster Wrap gleicher Art (z. B. mehrere Passkeys)
    }
  }
  throw new CryptoError('unwrap-failed', `Entsperren mit ${factor.kind} fehlgeschlagen`);
}

/**
 * Recovery: Backup-Code → UMK, danach **Pflicht**: neuer Faktor (neuer Passkey bzw. Passwort) und neuer Backup-Code.
 * Alte Faktor-Wraps und der alte Backup-Code sind danach ungültig (CRY-16).
 */
export async function prepareRecovery(
  db: StbDb,
  input: { backupCode: string; newFactor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string },
): Promise<PendingAccount> {
  const account = await loadAccount(db);
  if (!account) throw new Error('Kein Konto auf diesem Gerät');
  const umk = await unlockLocal(db, { kind: 'backup', code: input.backupCode });
  const backupCode = await generateBackupCode();
  const wraps = [await wrapUmk(umk, input.newFactor), await wrapUmk(umk, { kind: 'backup', code: backupCode })];
  const { passkey: _old, ...rest } = account;
  void _old;
  return {
    umk,
    backupCode,
    commit: () => save(db, { ...rest, wraps, ...(input.credentialId ? { passkey: { credentialId: input.credentialId } } : {}) }),
  };
}

export async function recoverWithBackupCode(
  db: StbDb,
  input: { backupCode: string; newFactor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string },
): Promise<{ umk: CryptoKey; backupCode: string }> {
  const pending = await prepareRecovery(db, input);
  await pending.commit();
  return { umk: pending.umk, backupCode: pending.backupCode };
}

// --- Faktorverwaltung (Spec 03, CRY-18; local-only). Alle Funktionen setzen eine entsperrte Sitzung (UMK) voraus; die
// Rückfrage mit dem aktuellen Faktor übernimmt die Oberfläche über `unlockLocal`. ---

export type FactorError = 'not-local-only' | 'last-factor' | 'no-passkey';

export class FactorManagementError extends Error {
  constructor(readonly code: FactorError) {
    super(code);
    this.name = 'FactorManagementError';
  }
}

async function requireLocal(db: StbDb): Promise<LocalAccount> {
  const account = await loadAccount(db);
  if (!account) throw new Error('Kein Konto auf diesem Gerät');
  if ((account as { mode: string }).mode !== 'local-only') throw new FactorManagementError('not-local-only');
  return account;
}

export async function factorInfo(db: StbDb): Promise<{ hasPassword: boolean; hasPasskey: boolean; wraps: UmkWrap[] } | undefined> {
  const account = await loadAccount(db);
  if (!account) return undefined;
  return { hasPassword: account.wraps.some((w) => w.factor === 'password'), hasPasskey: account.wraps.some((w) => w.factor === 'passkey'), wraps: account.wraps };
}

/** Setzt oder ändert das Passwort: der alte Passwort-Wrap entfällt, der neue verpackt dieselbe UMK. Gibt die neuen Wraps zurück. */
export async function setPassword(db: StbDb, umk: CryptoKey, password: string): Promise<UmkWrap[]> {
  const account = await requireLocal(db);
  const wraps = [...account.wraps.filter((w) => w.factor !== 'password'), await wrapUmk(umk, { kind: 'password', password })];
  await save(db, { ...account, wraps });
  return wraps;
}

/** Fügt einen Passkey hinzu (ersetzt einen vorhandenen — pro Gerät gibt es einen Passkey, `passkeyRequest` kennt eine Credential-ID). */
export async function addPasskey(db: StbDb, umk: CryptoKey, input: { prf: Uint8Array<ArrayBuffer>; credentialId: string }): Promise<UmkWrap[]> {
  const account = await requireLocal(db);
  const wraps = [...account.wraps.filter((w) => w.factor !== 'passkey'), await wrapUmk(umk, { kind: 'passkey', prf: input.prf })];
  await save(db, { ...account, wraps, passkey: { credentialId: input.credentialId } });
  return wraps;
}

/** Entfernt den Passkey — nur, wenn ein Passwort bleibt (mindestens ein Faktor außer dem Backup-Code). */
export async function removePasskey(db: StbDb): Promise<UmkWrap[]> {
  const account = await requireLocal(db);
  if (!account.wraps.some((w) => w.factor === 'passkey')) throw new FactorManagementError('no-passkey');
  if (!account.wraps.some((w) => w.factor === 'password')) throw new FactorManagementError('last-factor');
  const { passkey: _old, ...rest } = account;
  void _old;
  const wraps = account.wraps.filter((w) => w.factor !== 'passkey');
  await save(db, { ...rest, wraps });
  return wraps;
}

/** Neuer Backup-Code: gespeichert wird erst mit `commit()` nach der Pflichtbestätigung; der alte Wrap ist danach ungültig. */
export interface PendingBackupCode {
  backupCode: string;
  commit(): Promise<UmkWrap[]>;
}

export async function prepareBackupCodeRenewal(db: StbDb, umk: CryptoKey): Promise<PendingBackupCode> {
  await requireLocal(db);
  const backupCode = await generateBackupCode();
  const wrap = await wrapUmk(umk, { kind: 'backup', code: backupCode });
  return {
    backupCode,
    async commit() {
      const account = await requireLocal(db);
      const wraps = [...account.wraps.filter((w) => w.factor !== 'backup'), wrap];
      await save(db, { ...account, wraps });
      return wraps;
    },
  };
}
