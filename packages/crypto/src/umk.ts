// User Master Key (UMK) und seine Verpackung mit einem Faktor-KEK (Spec 03 „Schlüsselhierarchie").
//   Passkey-PRF → HKDF(info=umk-wrap/passkey)                          → KEK
//   Backup-Code → PBKDF2(600k) → HKDF(info=umk-wrap/backup)            → KEK
//   Passwort    → PBKDF2(600k) → HKDF(info=umk-wrap/password)          → KEK
//   KEK ─AES-KW→ UMK
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { normalizeBackupCode } from './backup-code.js';

export const PBKDF2_ITERATIONS = 600_000;
export const KDF_SALT_BYTES = 16;
const PRF_BYTES = 32;

export type UmkFactor =
  | { kind: 'passkey'; prf: Uint8Array<ArrayBuffer> }
  | { kind: 'backup'; code: string }
  | { kind: 'password'; password: string };

/** Gespeicherter (Server/lokal) UMK-Wrap. Enthält nur Salt und Chiffretext, nie Schlüsselmaterial. */
export interface UmkWrap {
  v: 1;
  factor: UmkFactor['kind'];
  salt: string;
  wrapped: string;
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/** Neue UMK (256 Bit, zufällig). Extrahierbar nur zum Verpacken per AES-KW; verlässt das Gerät nie unverpackt. */
export function generateUmk(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function pbkdf2(secret: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const base = await subtle().importKey('raw', utf8(secret), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, base, 256));
}

async function hkdfToKwKey(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) }, base, { name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

/** Leitet den KEK eines Faktors ab (nicht extrahierbar, nur wrapKey/unwrapKey). */
export async function deriveKek(factor: UmkFactor, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (salt.length !== KDF_SALT_BYTES) throw new RangeError(`Salt muss ${KDF_SALT_BYTES} Byte haben`);
  switch (factor.kind) {
    case 'passkey':
      if (factor.prf.length !== PRF_BYTES) throw new RangeError(`PRF-Ausgabe muss ${PRF_BYTES} Byte haben`);
      return hkdfToKwKey(factor.prf, salt, DOMAINS.umkWrapPasskey);
    case 'backup':
      return hkdfToKwKey(await pbkdf2(normalizeBackupCode(factor.code), salt), salt, DOMAINS.umkWrapBackup);
    case 'password':
      return hkdfToKwKey(await pbkdf2(factor.password.normalize('NFC'), salt), salt, DOMAINS.umkWrapPassword);
  }
}

export async function wrapUmk(umk: CryptoKey, factor: UmkFactor): Promise<UmkWrap> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(KDF_SALT_BYTES));
  const kek = await deriveKek(factor, salt);
  const wrapped = new Uint8Array(await subtle().wrapKey('raw', umk, kek, 'AES-KW'));
  return { v: 1, factor: factor.kind, salt: toBase64Url(salt), wrapped: toBase64Url(wrapped) };
}

/** Entpackt die UMK. Falscher Faktor, andere Faktor-Art oder manipulierter Wrap → `unwrap-failed`. */
export async function unwrapUmk(wrap: UmkWrap, factor: UmkFactor): Promise<CryptoKey> {
  if (wrap.v !== 1 || wrap.factor !== factor.kind) {
    throw new CryptoError('unwrap-failed', `UMK-Wrap passt nicht zum Faktor ${factor.kind}`);
  }
  if (factor.kind === 'passkey' && factor.prf.length !== PRF_BYTES) throw new RangeError(`PRF-Ausgabe muss ${PRF_BYTES} Byte haben`);
  let kek: CryptoKey;
  let wrapped: Uint8Array<ArrayBuffer>;
  try {
    wrapped = fromBase64Url(wrap.wrapped);
    kek = await deriveKek(factor, fromBase64Url(wrap.salt));
  } catch {
    throw new CryptoError('unwrap-failed', 'UMK-Wrap ist beschädigt');
  }
  try {
    return await subtle().unwrapKey('raw', wrapped, kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  } catch {
    throw new CryptoError('unwrap-failed', 'UMK konnte nicht entpackt werden (falscher Faktor oder beschädigter Wrap)');
  }
}
