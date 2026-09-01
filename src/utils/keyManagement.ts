// src/utils/keyManagement.ts
// Envelope-Encryption für Cloud-Sync (Passkey + Backup-Code) — ergänzt crypto.ts.
//
// Architektur (siehe _planning/schmerztagebuch-cloud-spec.md, Abschnitt
// "Passkey- & Verschlüsselungsarchitektur"):
//   - Ein zufälliger DEK (AES-256-GCM) verschlüsselt alle Cloud-Nutzerdaten.
//   - Der DEK wird NIE an den Server gesendet — nur "wrapped" (AES-KW) mit zwei
//     unabhängigen KEKs: KEK_passkey (aus WebAuthn-PRF) und KEK_backup (aus dem
//     Backup-Code). Beide Ableitungen laufen über HKDF-SHA256 via SubtleCrypto —
//     bewusst KEIN Argon2id/WASM im Client (iOS-Zuverlässigkeit unklar, siehe Spec
//     "Explizit NICHT nutzen"). Argon2 läuft ausschließlich serverseitig auf dem
//     authVerifier-Hash.
//
// Die eigentliche Datenverschlüsselung (entries.data / templates.blocks) läuft
// weiterhin über die bestehenden AES-GCM-Primitive in crypto.ts (encryptWithKey /
// decryptWithKey, v2-Format IV+Ciphertext) — hier wird nur der Schlüssel (DEK)
// erzeugt und verpackt.

import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

const EMPTY_SALT = new ArrayBuffer(0);

// ── DEK (Data Encryption Key) ──────────────────────────────────────────────

/** Erzeugt einen neuen zufälligen AES-256-GCM Data Encryption Key (extractable, für Wrapping/Caching). */
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Exportiert den DEK als Base64-Rohbytes (für sessionStorage-Caching, analog zum bestehenden lokalen Session-Muster in auth.ts). */
export async function exportDEKRaw(dek: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', dek);
  return arrayBufferToBase64(new Uint8Array(raw));
}

/** Importiert einen zuvor exportierten DEK aus Base64-Rohbytes zurück in einen CryptoKey. */
export async function importDEKRaw(base64: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(base64);
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// ── HKDF-Ableitungen ────────────────────────────────────────────────────────

async function hkdfBits(ikm: BufferSource, salt: BufferSource, info: string, bitLength: number): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
    baseKey,
    bitLength
  );
}

async function hkdfAesKwKey(ikm: BufferSource, salt: BufferSource, info: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
    baseKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * KEK_passkey = HKDF(prfOutput, info="schmerztagebuch-dek-wrap-v1")
 * Alltags-Schlüssel, abgeleitet aus dem WebAuthn-PRF-Extension-Output der gleichen
 * Ceremony wie Login/Registrierung. Kein Salt nötig (Spec nennt nur die info-Domäne;
 * das PRF-Secret ist bereits gerätegebunden und einzigartig pro Credential).
 */
export async function deriveKekFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  return hkdfAesKwKey(prfOutput, EMPTY_SALT, 'schmerztagebuch-dek-wrap-v1');
}

/**
 * authVerifier = HKDF(backupCode, kdf_salt, info="recovery-auth-v1")
 * Wird einmalig an den Server übertragen (dort argon2-gehasht, nie im Klartext gespeichert).
 * Aus diesem Wert lässt sich KEK_backup nicht rekonstruieren (getrennte HKDF-info-Domäne).
 */
export async function deriveBackupAuthVerifier(backupCode: string, kdfSaltBase64: string): Promise<string> {
  const ikm = new TextEncoder().encode(normalizeBackupCode(backupCode));
  const salt = base64ToArrayBuffer(kdfSaltBase64);
  const bits = await hkdfBits(ikm.buffer as ArrayBuffer, salt.buffer as ArrayBuffer, 'recovery-auth-v1', 256);
  return arrayBufferToBase64(new Uint8Array(bits));
}

/**
 * KEK_backup = HKDF(backupCode, kdf_salt, info="recovery-wrap-v1")
 * Verlässt das Gerät NIE — nur wrapped_dek_backup (das Ergebnis von AES-KW damit) geht an den Server.
 */
export async function deriveKekFromBackupCode(backupCode: string, kdfSaltBase64: string): Promise<CryptoKey> {
  const ikm = new TextEncoder().encode(normalizeBackupCode(backupCode));
  const salt = base64ToArrayBuffer(kdfSaltBase64);
  return hkdfAesKwKey(ikm.buffer as ArrayBuffer, salt.buffer as ArrayBuffer, 'recovery-wrap-v1');
}

/** Erzeugt einen neuen, nicht-geheimen kdf_salt (16 Byte) für die Backup-Code-Ableitung. */
export function generateKdfSalt(): string {
  return arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

// ── AES-KW Wrapping ──────────────────────────────────────────────────────────

/** Verpackt den DEK mit einem KEK (AES-KW) → Base64, geht an den Server (wrapped_dek_passkey / wrapped_dek_backup). */
export async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW');
  return arrayBufferToBase64(new Uint8Array(wrapped));
}

/** Entpackt den DEK mit einem KEK (AES-KW). */
export async function unwrapDEK(wrappedBase64: string, kek: CryptoKey): Promise<CryptoKey> {
  const wrapped = base64ToArrayBuffer(wrappedBase64);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped.buffer as ArrayBuffer,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ── Backup-Code (Base32, verwechslungsfreies Alphabet) ────────────────────────
//
// INTERPRETATION (Spec mehrdeutig, siehe Abschlussbericht): Die Spec beschreibt den
// Code sowohl als "160 Bit Zufall" als auch mit einem 25-Zeichen-Beispiel
// (5 Blöcke × 5 Zeichen = 125 Bit). Beides gleichzeitig ist mit 5-Bit-Symbolen nicht
// exakt erfüllbar. Konservative Wahl: volle 160 Bit Entropie (stärkeres Recovery-
// Secret, doppelt explizit im Text gefordert) → 32 Symbole, in 5er-Blöcken gruppiert
// (letzter Block dadurch nur 2 Zeichen lang). Das Alphabet selbst folgt wörtlich der
// Spec-Formulierung "keine verwechselbaren Zeichen I/L/O/0": Ziffern 1-9 + A-Z ohne
// I/L/O = exakt 32 Symbole (kein Standard-Crockford, der 0 einschließt und U ausschließt).

const BACKUP_CODE_ALPHABET = '123456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 32 Zeichen
const BACKUP_CODE_ENTROPY_BYTES = 20; // 160 bit
const BACKUP_CODE_GROUP_SIZE = 5;

/** Generiert einen neuen Backup-Code: 160 Bit Zufall, Base32-codiert, in 5er-Blöcken. */
export function generateBackupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_ENTROPY_BYTES));
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');

  let code = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    code += BACKUP_CODE_ALPHABET[parseInt(chunk, 2)];
  }

  return groupCode(code);
}

function groupCode(flatCode: string): string {
  const groups = flatCode.match(new RegExp(`.{1,${BACKUP_CODE_GROUP_SIZE}}`, 'g')) ?? [flatCode];
  return groups.join('-');
}

/** Normalisiert eine Backup-Code-Eingabe (Groß/Kleinschreibung, Trennzeichen/Leerzeichen) vor der HKDF-Ableitung. */
export function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Formatiert einen (z. B. vom Nutzer eingegebenen) Code für die Anzeige in 5er-Blöcken. */
export function formatBackupCodeForDisplay(rawCode: string): string {
  return groupCode(normalizeBackupCode(rawCode));
}
