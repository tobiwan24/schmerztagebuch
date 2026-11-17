// DK für Tagebücher, die nur auf diesem Gerät liegen (Spec 03, A-125): per HKDF aus der UMK abgeleitet, damit die lokale
// Verschlüsselung (Codec `aes`) ohne Server auskommt. Wechselt das Tagebuch später ins Konto, wird genau dieser DK
// weiterverwendet (und für das Konto verpackt hochgeladen) — sonst wären die lokal verschlüsselten Records unlesbar.
import { DOMAINS } from './domains.js';
import { utf8 } from './encoding.js';

/** Epoche des abgeleiteten DK (Rotation gibt es nur für Konto-Tagebücher). */
export const LOCAL_DK_EPOCH = 1;

async function hkdfAesKey(umk: CryptoKey, info: string, extractable: boolean): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const raw = new Uint8Array(await subtle.exportKey('raw', umk));
  const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  raw.fill(0);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/** `info = "stb/v3/dk|<diaryId>"`, SHA-256, Salt 32 × 0. Extrahierbar, damit der DK für das Konto verpackt werden kann. */
export function deriveLocalDiaryKey(umk: CryptoKey, diaryId: string): Promise<CryptoKey> {
  return hkdfAesKey(umk, `${DOMAINS.localDk}|${diaryId}`, true);
}

