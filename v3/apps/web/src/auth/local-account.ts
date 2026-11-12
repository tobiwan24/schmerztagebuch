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

/** Legt das Konto an. Der Backup-Code wird genau einmal zurückgegeben (Anzeige + Datei), nie gespeichert. */
export async function createLocalAccount(
  db: StbDb,
  input: { factor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string; now: () => number },
): Promise<{ umk: CryptoKey; backupCode: string }> {
  if (await hasAccount(db)) throw new Error('Auf diesem Gerät gibt es bereits ein Konto');
  const umk = await generateUmk();
  const backupCode = await generateBackupCode();
  const wraps = [await wrapUmk(umk, input.factor), await wrapUmk(umk, { kind: 'backup', code: backupCode })];
  await save(db, {
    v: 1, mode: 'local-only', createdAt: new Date(input.now()).toISOString(), wraps,
    ...(input.credentialId ? { passkey: { credentialId: input.credentialId } } : {}),
  });
  return { umk, backupCode };
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
export async function recoverWithBackupCode(
  db: StbDb,
  input: { backupCode: string; newFactor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string },
): Promise<{ umk: CryptoKey; backupCode: string }> {
  const account = await loadAccount(db);
  if (!account) throw new Error('Kein Konto auf diesem Gerät');
  const umk = await unlockLocal(db, { kind: 'backup', code: input.backupCode });
  const backupCode = await generateBackupCode();
  const wraps = [await wrapUmk(umk, input.newFactor), await wrapUmk(umk, { kind: 'backup', code: backupCode })];
  const { passkey: _old, ...rest } = account;
  void _old;
  await save(db, { ...rest, wraps, ...(input.credentialId ? { passkey: { credentialId: input.credentialId } } : {}) });
  return { umk, backupCode };
}
