// Backup-Code (Spec 03): 128 Bit Zufall, Base32 (RFC 4648) in 8er-Gruppen.
// Format: 16 Zufallsbytes + 4 Byte Prüfsumme (SHA-256-Präfix) = 160 Bit = 32 Base32-Zeichen = 4 Gruppen à 8
// (DECISIONS A-011). Die Prüfsumme erkennt Tippfehler, bevor die teure PBKDF2-Ableitung läuft; sie erhöht die
// Entropie nicht.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { toBase64Url, utf8 } from './encoding.js';

export const BACKUP_CODE_ENTROPY_BITS = 128;
const RANDOM_BYTES = BACKUP_CODE_ENTROPY_BITS / 8;
const CHECK_BYTES = 4;
const CODE_CHARS = ((RANDOM_BYTES + CHECK_BYTES) * 8) / 5;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Normalisiert Eingaben tolerant: Groß-/Kleinschreibung, Leerzeichen und Bindestriche spielen keine Rolle. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

function toBase32(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(acc >> bits) & 31];
    }
  }
  return out;
}

function fromBase32(s: string): Uint8Array<ArrayBuffer> | null {
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (const c of s) {
    const v = B32.indexOf(c);
    if (v < 0) return null;
    acc = ((acc << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

async function checksum(random: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', random)).subarray(0, CHECK_BYTES);
}

/** Neuer Backup-Code, z. B. `ABCDEFGH-IJKLMNOP-QRSTUVWX-YZ234567`. */
export async function generateBackupCode(): Promise<string> {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(RANDOM_BYTES));
  const all = new Uint8Array(RANDOM_BYTES + CHECK_BYTES);
  all.set(random);
  all.set(await checksum(random), RANDOM_BYTES);
  return toBase32(all).match(/.{8}/g)!.join('-');
}

/** Prüft Format und Prüfsumme; liefert die normalisierte Form oder wirft `wrong-backup-code`. */
export async function parseBackupCode(input: string): Promise<string> {
  const code = normalizeBackupCode(input);
  const bytes = code.length === CODE_CHARS ? fromBase32(code) : null;
  if (bytes) {
    const expected = await checksum(bytes.slice(0, RANDOM_BYTES));
    if (expected.every((b, i) => b === bytes[RANDOM_BYTES + i])) return code;
  }
  throw new CryptoError('wrong-backup-code', 'Backup-Code ist ungültig — bitte Eingabe prüfen');
}

/**
 * Backup-Auth-Token für Recovery im Konto-Modus (DECISIONS A-023): HKDF-SHA-256 aus dem normalisierten Code mit eigener
 * Domain (`stb/v3/backup-auth`) — unabhängig vom UMK-KEK (PBKDF2 + `stb/v3/umk-wrap/backup`). Der Server speichert nur den
 * SHA-256 des Tokens; 128 Bit Entropie machen Durchprobieren aussichtslos.
 */
export async function deriveBackupAuth(code: string): Promise<string> {
  const normalized = await parseBackupCode(code);
  const base = await globalThis.crypto.subtle.importKey('raw', utf8(normalized), 'HKDF', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8(DOMAINS.backupAuth) },
    base,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}
