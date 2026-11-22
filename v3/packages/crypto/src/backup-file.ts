// Backup-Datei `.stbbackup` (Spec 07 „Backup"): Inhalt (JSON v1) mit AES-GCM verschlüsselt; Schlüssel per PBKDF2
// (600k, Spec 03) aus dem Backup-Code oder einem separaten Backup-Passwort, danach HKDF mit eigener Domain.
// Header im Klartext (Format, Version, KDF-Parameter, Salt, IV, Art des Geheimnisses) — als AAD an den Chiffretext gebunden.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { parseBackupCode } from './backup-code.js';
import { PBKDF2_ITERATIONS } from './umk.js';

export const BACKUP_FILE_FORMAT = 'stb-backup';
export const BACKUP_FILE_VERSION = 1;

export type BackupSecret = { kind: 'backup-code'; code: string } | { kind: 'password'; password: string };

export interface BackupFileHeader {
  format: typeof BACKUP_FILE_FORMAT;
  version: typeof BACKUP_FILE_VERSION;
  secret: BackupSecret['kind'];
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  createdAt: string;
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const aadOf = (h: BackupFileHeader) =>
  utf8(JSON.stringify([h.format, h.version, h.secret, h.kdf.name, h.kdf.hash, h.kdf.iterations, h.kdf.salt, h.cipher.name, h.cipher.iv, h.createdAt]));

async function deriveKey(secret: BackupSecret, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = secret.kind === 'backup-code' ? await parseBackupCode(secret.code) : secret.password.normalize('NFC');
  const base = await subtle().importKey('raw', utf8(material), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
  const hk = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(DOMAINS.backupFile) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Verschlüsselt den Inhalt; Ergebnis ist der Dateiinhalt (JSON-Text mit Klartext-Header und Chiffretext). */
export async function sealBackupFile(plaintext: string, secret: BackupSecret, createdAt: string): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const header: BackupFileHeader = {
    format: BACKUP_FILE_FORMAT, version: BACKUP_FILE_VERSION, secret: secret.kind,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64Url(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64Url(iv) }, createdAt,
  };
  const key = await deriveKey(secret, salt, PBKDF2_ITERATIONS);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aadOf(header) }, key, utf8(plaintext)));
  return JSON.stringify({ ...header, ciphertext: toBase64Url(ct) });
}

/** Liest nur den Header (z. B. um nach Backup-Code oder Passwort zu fragen). */
export function readBackupHeader(file: string): BackupFileHeader {
  let raw: unknown;
  try {
    raw = JSON.parse(file);
  } catch {
    throw new CryptoError('malformed-envelope', 'Keine Backup-Datei');
  }
  const h = raw as Partial<BackupFileHeader> & { ciphertext?: unknown };
  if (h?.format !== BACKUP_FILE_FORMAT || typeof h.ciphertext !== 'string' || !h.kdf || !h.cipher) throw new CryptoError('malformed-envelope', 'Keine Backup-Datei');
  if (h.version !== BACKUP_FILE_VERSION) throw new CryptoError('unsupported-version', `Backup-Version ${String(h.version)} wird nicht unterstützt`);
  if (h.kdf.name !== 'PBKDF2' || h.kdf.hash !== 'SHA-256' || !(h.kdf.iterations >= 100_000) || h.cipher.name !== 'AES-GCM') {
    throw new CryptoError('malformed-envelope', 'Unbekannte Verschlüsselungsparameter');
  }
  return { format: h.format, version: h.version, secret: h.secret!, kdf: h.kdf, cipher: h.cipher, createdAt: h.createdAt! };
}

/** Entschlüsselt. Falscher Code → `wrong-backup-code`, falsches Passwort → `wrong-password`; manipulierte Datei ebenso. */
export async function openBackupFile(file: string, secret: BackupSecret): Promise<string> {
  const header = readBackupHeader(file);
  const ciphertext = (JSON.parse(file) as { ciphertext: string }).ciphertext;
  const wrong = secret.kind === 'backup-code' ? 'wrong-backup-code' : 'wrong-password';
  if (header.secret !== secret.kind) throw new CryptoError(wrong, 'Diese Datei ist mit einem anderen Geheimnis gesichert');
  const key = await deriveKey(secret, fromBase64Url(header.kdf.salt), header.kdf.iterations);
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64Url(header.cipher.iv), additionalData: aadOf(header) }, key, fromBase64Url(ciphertext));
    return new TextDecoder().decode(pt);
  } catch {
    throw new CryptoError(wrong, 'Backup konnte nicht entschlüsselt werden');
  }
}
