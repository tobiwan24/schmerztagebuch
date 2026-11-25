// Identity-Private-Key, verschlüsselt mit der UMK (Spec 03 „Registrierung (cloud)": „Identity-Keys erzeugen, mit UMK
// verschlüsseln"). AES-GCM, AAD bindet an Domain und öffentlichen Schlüssel — ein Austausch des Public Keys fällt auf.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export interface SealedIdentity {
  v: 1;
  iv: string;
  ct: string;
}

const aad = (publicKey: string) => utf8(`${DOMAINS.identitySeal}|${publicKey}`);

export async function sealIdentityKey(umk: CryptoKey, pair: CryptoKeyPair): Promise<{ publicKey: string; sealed: SealedIdentity }> {
  const publicKey = toBase64Url(new Uint8Array(await subtle().exportKey('raw', pair.publicKey)));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(publicKey) }, umk, pkcs8));
  return { publicKey, sealed: { v: 1, iv: toBase64Url(iv), ct: toBase64Url(ct) } };
}

/** Öffnet den Identity-Key. Falsche UMK, anderer Public Key oder Manipulation → `unwrap-failed`. */
export async function openIdentityKey(umk: CryptoKey, publicKey: string, sealed: SealedIdentity): Promise<CryptoKeyPair> {
  try {
    if (sealed.v !== 1) throw new Error('Version');
    const pkcs8 = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64Url(sealed.iv), additionalData: aad(publicKey) }, umk, fromBase64Url(sealed.ct));
    const privateKey = await subtle().importKey('pkcs8', pkcs8, ECDH, true, ['deriveBits']);
    const pub = await subtle().importKey('raw', fromBase64Url(publicKey), ECDH, true, []);
    return { privateKey, publicKey: pub };
  } catch {
    throw new CryptoError('unwrap-failed', 'Identity-Schlüssel konnte nicht geöffnet werden');
  }
}
