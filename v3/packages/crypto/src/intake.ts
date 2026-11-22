// Intake-Siegel (Spec 08): ephemeres ECDH P-256 mit dem Intake-Public-Key → HKDF(info "stb/v3/intake") → AES-GCM.
// Der Server versiegelt den Kurzbefehl-Body sofort und kann das Siegel danach selbst nicht mehr öffnen.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export interface IntakeSeal {
  v: 1;
  epk: string;
  iv: string;
  ct: string;
}

async function deriveKey(priv: CryptoKey, pub: CryptoKey, epkRaw: Uint8Array<ArrayBuffer>, recipientRaw: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const salt = new Uint8Array(epkRaw.length + recipientRaw.length);
  salt.set(epkRaw);
  salt.set(recipientRaw, epkRaw.length);
  const base = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(DOMAINS.intake) }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

const aad = (diaryId: string) => utf8(`${DOMAINS.intake}|${diaryId}`);

/** Versiegelt `plaintext` für den Intake-Public-Key (raw, base64url) eines Tagebuchs. */
export async function sealForIntake(recipientPublicKey: string, diaryId: string, plaintext: Uint8Array<ArrayBuffer>): Promise<IntakeSeal> {
  const recipientRaw = fromBase64Url(recipientPublicKey);
  const recipient = await subtle().importKey('raw', recipientRaw, ECDH, false, []);
  const eph = await subtle().generateKey(ECDH, true, ['deriveBits']);
  const epkRaw = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const key = await deriveKey(eph.privateKey, recipient, epkRaw, recipientRaw, 'encrypt');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(diaryId) }, key, plaintext));
  return { v: 1, epk: toBase64Url(epkRaw), iv: toBase64Url(iv), ct: toBase64Url(ct) };
}

/** Öffnet ein Siegel mit dem Intake-Schlüsselpaar. Falscher Schlüssel/Tagebuch/Manipulation → `decrypt-failed`. */
export async function unsealIntake(seal: IntakeSeal, recipient: CryptoKeyPair, diaryId: string): Promise<Uint8Array<ArrayBuffer>> {
  try {
    if (seal.v !== 1) throw new Error('Version');
    const epkRaw = fromBase64Url(seal.epk);
    const epk = await subtle().importKey('raw', epkRaw, ECDH, false, []);
    const recipientRaw = new Uint8Array(await subtle().exportKey('raw', recipient.publicKey));
    const key = await deriveKey(recipient.privateKey, epk, epkRaw, recipientRaw, 'decrypt');
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64Url(seal.iv), additionalData: aad(diaryId) }, key, fromBase64Url(seal.ct)));
  } catch {
    throw new CryptoError('decrypt-failed', 'Intake-Siegel konnte nicht geöffnet werden');
  }
}
