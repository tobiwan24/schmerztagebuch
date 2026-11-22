// base64url ohne Padding (RFC 4648 §5), ohne Abhängigkeit von `btoa`/`Buffer`.
import { CryptoError } from './errors.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += ALPHABET[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (s.length % 4 === 1) throw new CryptoError('malformed-envelope', 'Ungültige base64url-Länge');
  const out = new Uint8Array(Math.floor((s.length * 6) / 8));
  let bits = 0;
  let acc = 0;
  let j = 0;
  for (const c of s) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new CryptoError('malformed-envelope', `Ungültiges base64url-Zeichen: ${JSON.stringify(c)}`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

export const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
