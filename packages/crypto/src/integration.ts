// Integrationen (Spec 03 „Erweiterungen v3.x", M24, A-094): Eine Integration ist ein Principal mit eigenem ECDH-Schlüssel;
// der Owner verpackt den DK dafür (wie für ein Mitglied). Token und privater Schlüssel werden einmal als EIN String
// angezeigt (`stbi1.<payload>.<prüfsumme>`), der Server bekommt nur Token-Hash, öffentlichen Schlüssel und Wrap.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { exportPublicKey, generateIdentityEcdhKeyPair, importPublicKey, wrapDkForMember, type DkWrapContext, type MemberDkWrap } from './share.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const TOKEN_PREFIX = 'stbi_';
const TOKEN_BYTES = 32;
const ACCESS_PREFIX = 'stbi1';
const CHECKSUM_BYTES = 6;

/** Inhalt des Zugangsstrings. */
export interface IntegrationAccess {
  token: string;
  /** Identity-Schlüsselpaar der Integration (privat: PKCS#8, extrahierbar nur zum Export beim Anlegen). */
  keyPair: CryptoKeyPair;
  publicKey: string;
  diaryId: string;
  /** Server-Adresse (optional, damit der Client ohne weitere Angabe auskommt). */
  origin?: string;
}

export interface IntegrationCredentials {
  token: string;
  /** SHA-256 des Tokens (base64url) — das einzige, was der Server vom Token speichert. */
  tokenHash: string;
  publicKey: string;
  wrap: MemberDkWrap;
  /** Einmal anzeigen: enthält Token und privaten Schlüssel. */
  accessString: string;
}

/** Zufälliger API-Token (256 Bit) mit erkennbarem Präfix. */
export function generateIntegrationToken(): string {
  return TOKEN_PREFIX + toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** SHA-256 (base64url) — identisch zum Hash des Servers (`createHash('sha256').digest('base64url')`). */
export async function hashIntegrationToken(token: string): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle().digest('SHA-256', utf8(token))));
}

async function checksum(payload: string): Promise<string> {
  const d = new Uint8Array(await subtle().digest('SHA-256', utf8(`${DOMAINS.integrationAccess}|${payload}`)));
  return toBase64Url(d.slice(0, CHECKSUM_BYTES));
}

/** Baut den Zugangsstring `stbi1.<base64url(JSON)>.<Prüfsumme>`. */
export async function encodeAccessString(a: IntegrationAccess): Promise<string> {
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', a.keyPair.privateKey));
  const json = JSON.stringify({ v: 1, t: a.token, k: toBase64Url(pkcs8), p: a.publicKey, d: a.diaryId, ...(a.origin ? { o: a.origin } : {}) });
  const payload = toBase64Url(utf8(json));
  return `${ACCESS_PREFIX}.${payload}.${await checksum(payload)}`;
}

const bad = (m: string) => new CryptoError('invalid-access-string', m);

/** Liest einen Zugangsstring. Tippfehler (Prüfsumme), fremdes Format oder beschädigter Inhalt → `invalid-access-string`. */
export async function parseAccessString(input: string): Promise<IntegrationAccess> {
  const parts = input.trim().split('.');
  if (parts.length !== 3 || parts[0] !== ACCESS_PREFIX) throw bad('Zugangsstring hat ein unbekanntes Format');
  const [, payload, sum] = parts as [string, string, string];
  if ((await checksum(payload)) !== sum) throw bad('Prüfsumme des Zugangsstrings stimmt nicht — bitte vollständig und unverändert eingeben');
  try {
    const o = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { v: number; t: string; k: string; p: string; d: string; o?: string };
    if (o.v !== 1 || typeof o.t !== 'string' || !o.t.startsWith(TOKEN_PREFIX) || typeof o.d !== 'string') throw new Error('Inhalt');
    const privateKey = await subtle().importKey('pkcs8', fromBase64Url(o.k), ECDH, true, ['deriveBits']);
    const publicKey = await importPublicKey(o.p);
    return { token: o.t, keyPair: { privateKey, publicKey }, publicKey: o.p, diaryId: o.d, ...(o.o ? { origin: o.o } : {}) };
  } catch {
    throw bad('Zugangsstring ist beschädigt');
  }
}

/** Legt eine Integration an: Schlüsselpaar, DK-Wrap (an Tagebuch + Epoche gebunden), Token samt Hash und Zugangsstring. */
export async function createIntegrationCredentials(dk: CryptoKey, ctx: DkWrapContext, origin?: string): Promise<IntegrationCredentials> {
  const keyPair = await generateIdentityEcdhKeyPair();
  const publicKey = await exportPublicKey(keyPair.publicKey);
  const wrap = await wrapDkForMember(dk, keyPair.publicKey, ctx);
  const token = generateIntegrationToken();
  const accessString = await encodeAccessString({ token, keyPair, publicKey, diaryId: ctx.diaryId, ...(origin ? { origin } : {}) });
  return { token, tokenHash: await hashIntegrationToken(token), publicKey, wrap, accessString };
}
