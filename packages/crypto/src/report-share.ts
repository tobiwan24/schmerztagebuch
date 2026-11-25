// Arzt-Link (Spec 07, M18): Berichtspaket mit zufälligem Schlüssel K (256 Bit) per AES-GCM verschlüsseln.
// AAD `stb/v3/share|<id>`. K steht nur im URL-Fragment (`#k=…`) und erreicht den Server nie.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const aad = (id: string) => utf8(`${DOMAINS.share}|${id}`);
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Zufällige Link-ID (128 Bit, base64url) — wird vom Client erzeugt, weil sie in die AAD eingeht. */
export function generateShareId(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

/** Zufälliger Link-Schlüssel K (256 Bit, base64url). */
export function generateShareKey(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

async function importKey(key: string, usage: KeyUsage): Promise<CryptoKey> {
  const raw = fromBase64Url(key);
  if (raw.length !== KEY_BYTES) throw new CryptoError('malformed-envelope', 'Link-Schlüssel hat die falsche Länge');
  return subtle().importKey('raw', raw, 'AES-GCM', false, [usage]);
}

/** Verschlüsselt das Berichtspaket; Ergebnis ist base64url(iv ‖ ciphertext). */
export async function encryptReport(key: string, id: string, plaintext: Uint8Array<ArrayBuffer>): Promise<string> {
  const k = await importKey(key, 'encrypt');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(id) }, k, plaintext));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv);
  out.set(ct, IV_BYTES);
  return toBase64Url(out);
}

/** Entschlüsselt; falscher Schlüssel, falsche ID (AAD) oder Manipulation → `decrypt-failed`. */
export async function decryptReport(key: string, id: string, ciphertext: string): Promise<Uint8Array<ArrayBuffer>> {
  const k = await importKey(key, 'decrypt');
  try {
    const raw = fromBase64Url(ciphertext);
    if (raw.length <= IV_BYTES) throw new Error('zu kurz');
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, IV_BYTES), additionalData: aad(id) }, k, raw.slice(IV_BYTES)));
  } catch {
    throw new CryptoError('decrypt-failed', 'Bericht konnte nicht entschlüsselt werden');
  }
}

/** Link `<origin>/r/<id>#k=<K>`. */
export function buildReportLink(origin: string, id: string, key: string): string {
  return `${origin.replace(/\/$/, '')}/r/${id}#k=${key}`;
}

/** Liest K aus einem URL-Fragment (`#k=…`); `null`, wenn es fehlt. */
export function parseReportKey(hash: string): string | null {
  const m = /^#?k=([A-Za-z0-9_-]{43})$/.exec(hash);
  return m ? m[1]! : null;
}
