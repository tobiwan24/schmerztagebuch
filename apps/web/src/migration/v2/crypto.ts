// v2-Entschlüsselung, nur lesend portiert aus v2 `src/utils/crypto.ts`, `src/utils/auth.ts`, `src/utils/keyManagement.ts`
// und `src/hooks/useDecrypt.ts` (Spec 11, Schritt 2). Verschlüsselt wird hier nichts.
//
// Formate:
//   v1 (Legacy): Base64(salt[16] | iv[12] | AES-GCM-Chiffretext), Schlüssel = PBKDF2-SHA-256(Passwort, salt, 100k)
//   v2:          Base64(iv[12] | Chiffretext), Schlüssel = PBKDF2-SHA-256(Passwort, appSalt, 100k) oder Cloud-DEK
//   Cloud-DEK:   AES-KW-verpackt mit KEK = HKDF(PRF-Ausgabe, '', 'schmerztagebuch-dek-wrap-v1') bzw.
//                HKDF(normalisierter Backup-Code, kdfSalt, 'recovery-wrap-v1')
import { CryptoError } from '@stb/crypto';
import type { V2Block } from '@stb/core';

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100_000;
const PASSWORD_TEST_PLAINTEXT = 'PASSWORD_VERIFICATION_TEST';

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function pbkdf2Key(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

async function gcmDecrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, ct: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  } catch {
    throw new CryptoError('decrypt-failed', 'v2-Daten ließen sich nicht entschlüsseln');
  }
}

/** v1-Format (Salt pro Eintrag). */
export async function decryptV1(data: string, password: string): Promise<string> {
  const all = fromBase64(data);
  if (all.length <= SALT_LENGTH + IV_LENGTH) throw new CryptoError('malformed-envelope', 'v1-Daten zu kurz');
  const key = await pbkdf2Key(password, all.slice(0, SALT_LENGTH));
  return gcmDecrypt(key, all.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH), all.slice(SALT_LENGTH + IV_LENGTH));
}

/** v2-Format mit Sitzungsschlüssel oder Cloud-DEK. */
export async function decryptWithKey(data: string, key: CryptoKey): Promise<string> {
  const all = fromBase64(data);
  if (all.length <= IV_LENGTH) throw new CryptoError('malformed-envelope', 'v2-Daten zu kurz');
  return gcmDecrypt(key, all.slice(0, IV_LENGTH), all.slice(IV_LENGTH));
}

/** Sitzungsschlüssel aus Passwort + `appSalt` (Setting, Base64). */
export function deriveV2SessionKey(password: string, appSaltB64: string): Promise<CryptoKey> {
  return pbkdf2Key(password, fromBase64(appSaltB64));
}

export interface V2Settings {
  encryptionMode?: string;
  passwordTest?: string;
  passwordTestV2?: string;
  appSalt?: string;
  cloudSyncEnabled?: string;
  cloudUsername?: string;
}

export interface V2LocalKeys {
  password: string;
  /** Nur wenn `appSalt` vorhanden. */
  sessionKey?: CryptoKey;
}

/**
 * v2-Passwort prüfen (wie v2 `checkPassword`: zuerst `passwordTestV2`, dann `passwordTest`) und die lokalen
 * Schlüssel liefern. Falsches Passwort → `CryptoError('wrong-password')`.
 */
export async function unlockV2Password(settings: V2Settings, password: string): Promise<V2LocalKeys> {
  const sessionKey = settings.appSalt ? await deriveV2SessionKey(password, settings.appSalt) : undefined;
  if (settings.passwordTestV2 && sessionKey) {
    if (await matches(() => decryptWithKey(settings.passwordTestV2!, sessionKey))) return { password, sessionKey };
  }
  if (settings.passwordTest) {
    if (await matches(() => decryptV1(settings.passwordTest!, password))) return { password, ...(sessionKey ? { sessionKey } : {}) };
  }
  if (!settings.passwordTest && !settings.passwordTestV2) {
    throw new CryptoError('wrong-password', 'In v2 ist kein Passwort hinterlegt');
  }
  throw new CryptoError('wrong-password', 'Falsches v2-Passwort');
}

async function matches(fn: () => Promise<string>): Promise<boolean> {
  try {
    return (await fn()) === PASSWORD_TEST_PLAINTEXT;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cloud-DEK

async function hkdfKwKey(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, base, { name: 'AES-KW', length: 256 }, false, ['unwrapKey']);
}

export const normalizeV2BackupCode = (code: string) => code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

async function unwrap(wrappedB64: string, kek: CryptoKey, failCode: 'unwrap-failed' | 'wrong-backup-code'): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey('raw', fromBase64(wrappedB64), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  } catch {
    throw new CryptoError(failCode, 'v2-Cloud-Schlüssel ließ sich nicht entpacken');
  }
}

/** DEK mit der PRF-Ausgabe des v2-Passkeys entpacken (`wrapped_dek_passkey`). */
export async function unwrapDekWithPrf(wrappedB64: string, prf: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return unwrap(wrappedB64, await hkdfKwKey(prf, new Uint8Array(0), 'schmerztagebuch-dek-wrap-v1'), 'unwrap-failed');
}

/** DEK mit dem v2-Backup-Code entpacken (`wrapped_dek_backup`, `kdf_salt`). */
export async function unwrapDekWithBackupCode(wrappedB64: string, code: string, kdfSaltB64: string): Promise<CryptoKey> {
  const kek = await hkdfKwKey(new TextEncoder().encode(normalizeV2BackupCode(code)), fromBase64(kdfSaltB64), 'recovery-wrap-v1');
  return unwrap(wrappedB64, kek, 'wrong-backup-code');
}

// ---------------------------------------------------------------------------------------------------------------
// Einträge

export interface V2RawEntry {
  encrypted: boolean;
  data: string;
  encryptionVersion?: number;
  encryptionSource?: 'cloud' | 'local';
}

export interface V2DecryptKeys {
  local?: V2LocalKeys;
  dek?: CryptoKey;
}

/**
 * Eintrag entschlüsseln — Reihenfolge wie v2 `useDecrypt`: unverschlüsselt → JSON; Format v2 → Cloud-DEK, dann
 * Sitzungsschlüssel; sonst v1 mit Passwort. Liefert Blöcke oder einen Grund (blockiert andere Einträge nie, MIG-13).
 */
export async function decryptV2Entry(entry: V2RawEntry, keys: V2DecryptKeys): Promise<{ blocks: V2Block[] } | { error: string }> {
  try {
    let json: string;
    if (!entry.encrypted) json = entry.data;
    else if (entry.encryptionVersion === 2) {
      const candidates = [keys.dek, keys.local?.sessionKey].filter((k): k is CryptoKey => !!k);
      if (!candidates.length) return { error: entry.encryptionSource === 'cloud' ? 'Cloud-Schlüssel fehlt (v2-Anmeldung nötig)' : 'v2-Passwort fehlt' };
      json = await firstSuccess(candidates.map((k) => () => decryptWithKey(entry.data, k)));
    } else {
      if (!keys.local) return { error: 'v2-Passwort fehlt' };
      json = await decryptV1(entry.data, keys.local.password);
    }
    const blocks: unknown = JSON.parse(json);
    if (!Array.isArray(blocks)) return { error: 'Daten unlesbar' };
    return { blocks: blocks as V2Block[] };
  } catch (e) {
    if (e instanceof SyntaxError) return { error: 'Daten unlesbar' };
    return { error: 'nicht entschlüsselbar (falscher Schlüssel)' };
  }
}

async function firstSuccess(attempts: (() => Promise<string>)[]): Promise<string> {
  let last: unknown;
  for (const a of attempts) {
    try {
      return await a();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
