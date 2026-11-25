// Einladungen und Sicherheitsnummer (Spec 09).
// - Das Einladungs-`secret` (128 Bit) steht nur im URL-Fragment. Daraus werden per HKDF zwei getrennte Schlüssel
//   abgeleitet: AES-GCM für den Einladungs-Chiffretext (Name, Rolle) und HMAC für die Bindung des Identity-Public-Keys
//   der eingeladenen Person. Der Server kann so keinen eigenen Schlüssel einschleusen (SHR-03).
// - Sicherheitsnummer: 12 Zifferngruppen aus SHA-256("stb/v3/fingerprint" | sortierte Identity-Public-Keys) (SHR-04).
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { CryptoError } from './errors.js';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const INVITE_CT_INFO = `${DOMAINS.share}|invite-ct`;
const INVITE_MAC_INFO = `${DOMAINS.share}|invite-mac`;

export function createInvitationSecret(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveFromSecret(secret: string, info: string, alg: AesKeyGenParams | HmacImportParams, usages: KeyUsage[]): Promise<CryptoKey> {
  const raw = fromBase64Url(secret);
  if (raw.length !== 16) throw new CryptoError('decrypt-failed', 'Einladungs-Geheimnis hat nicht 128 Bit');
  const base = await subtle().importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(info) }, base, alg, false, usages);
}

export interface InvitationDetails {
  diaryName: string;
  role: 'editor' | 'viewer';
  inviterName: string;
}

export async function encryptInvitation(details: InvitationDetails, secret: string): Promise<string> {
  const key = await deriveFromSecret(secret, INVITE_CT_INFO, { name: 'AES-GCM', length: 256 }, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(details))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toBase64Url(out);
}

export async function decryptInvitation(ciphertext: string, secret: string): Promise<InvitationDetails> {
  try {
    const key = await deriveFromSecret(secret, INVITE_CT_INFO, { name: 'AES-GCM', length: 256 }, ['decrypt']);
    const raw = fromBase64Url(ciphertext);
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(plain)) as InvitationDetails;
  } catch {
    throw new CryptoError('decrypt-failed', 'Einladung konnte nicht geöffnet werden (Link unvollständig?)');
  }
}

/** HMAC(secret, identityPub) — von der eingeladenen Person beim Annehmen mitgeschickt. */
export async function invitationMac(secret: string, identityPub: string): Promise<string> {
  const key = await deriveFromSecret(secret, INVITE_MAC_INFO, { name: 'HMAC', hash: 'SHA-256' }, ['sign']);
  return toBase64Url(new Uint8Array(await subtle().sign('HMAC', key, utf8(identityPub))));
}

/** Prüft die Bindung (konstante Laufzeit über WebCrypto `verify`). */
export async function verifyInvitationMac(secret: string, identityPub: string, mac: string): Promise<boolean> {
  try {
    const key = await deriveFromSecret(secret, INVITE_MAC_INFO, { name: 'HMAC', hash: 'SHA-256' }, ['verify']);
    return await subtle().verify('HMAC', key, fromBase64Url(mac), utf8(identityPub));
  } catch {
    return false;
  }
}

/** Sicherheitsnummer zweier Personen: 12 Gruppen à 5 Ziffern, auf beiden Seiten identisch (Reihenfolge egal). */
export async function safetyNumber(identityPubA: string, identityPubB: string): Promise<string[]> {
  const [first, second] = [identityPubA, identityPubB].sort();
  const input = utf8(`${DOMAINS.fingerprint}|${first}|${second}`);
  const digest = new Uint8Array(await subtle().digest('SHA-256', input));
  const groups: string[] = [];
  // 12 × 20 Bit = 240 von 256 Bit; je Gruppe mod 100000 → 5 Ziffern.
  for (let g = 0; g < 12; g++) {
    let v = 0;
    for (let bit = g * 20; bit < g * 20 + 20; bit++) v = v * 2 + ((digest[bit >> 3]! >> (7 - (bit & 7))) & 1);
    groups.push(String(v % 100_000).padStart(5, '0'));
  }
  return groups;
}

export interface VerificationState {
  safetyNumber: string;
  verified: boolean;
}

/**
 * Abgleich mit dem gespeicherten Stand: Hat sich die Sicherheitsnummer (also ein Identity-Key) geändert, wird
 * „verifiziert" entfernt und `changed` gesetzt (Hinweis im UI).
 */
export function updateVerification(stored: VerificationState | undefined, current: string[]): VerificationState & { changed: boolean } {
  const now = current.join(' ');
  if (!stored) return { safetyNumber: now, verified: false, changed: false };
  if (stored.safetyNumber !== now) return { safetyNumber: now, verified: false, changed: true };
  return { ...stored, changed: false };
}
