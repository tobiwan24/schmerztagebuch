// Verschlüsselungs-Utilities für das Schmerztagebuch
// Verwendet Web Crypto API (AES-GCM) + PBKDF2 für Key Derivation

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;

/**
 * Prüft ob crypto.subtle verfügbar ist (nur über HTTPS oder localhost)
 */
export function isCryptoAvailable(): boolean {
  return !!(window.crypto && window.crypto.subtle);
}

/**
 * Gibt Hilfetext für fehlende crypto.subtle API
 */
export function getCryptoErrorMessage(): string {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  if (protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return 'Verschlüsselung erfordert HTTPS. Bitte öffne die App über https:// oder localhost.';
  }

  return 'Web Crypto API nicht verfügbar. Browser nicht unterstützt.';
}

/**
 * iOS-kompatible Base64-Encoding (btoa hat Probleme mit großen Arrays)
 */
export function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * iOS-kompatible Base64-Decoding
 */
export function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generiert einen zufälligen Salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generiert einen zufälligen IV (Initialization Vector)
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Leitet einen Schlüssel aus dem Passwort ab (PBKDF2)
 * @param extractable - true: Key kann exportiert werden (für Key-Caching); false: nicht exportierbar (Standard)
 */
export async function deriveKey(password: string, salt: Uint8Array, extractable = false): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const importedKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    importedKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/**
 * Verschlüsselt Daten mit einem vorhandenen CryptoKey (v2-Format: IV + Ciphertext, kein Salt)
 * @returns Base64(IV[12] + AES-GCM-ciphertext)
 */
export async function encryptWithKey(data: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const iv = generateIV();

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    dataBuffer.buffer as ArrayBuffer
  );

  const combined = new Uint8Array(IV_LENGTH + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), IV_LENGTH);
  return arrayBufferToBase64(combined);
}

/**
 * Entschlüsselt Daten mit einem vorhandenen CryptoKey (v2-Format: IV + Ciphertext)
 * @param encryptedData - Base64(IV[12] + AES-GCM-ciphertext)
 */
export async function decryptWithKey(encryptedData: string, key: CryptoKey): Promise<string> {
  const combined = base64ToArrayBuffer(encryptedData);
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encrypted.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Erstellt einen verschlüsselten Test-String mit einem CryptoKey (für passwordTestV2 in Settings)
 */
export async function createPasswordTestWithKey(key: CryptoKey): Promise<string> {
  return await encryptWithKey('PASSWORD_VERIFICATION_TEST', key);
}

/**
 * Verifiziert ein Passwort über passwordTestV2 (v2-Format)
 */
export async function verifyPasswordWithKey(encryptedTestData: string, key: CryptoKey): Promise<boolean> {
  try {
    await decryptWithKey(encryptedTestData, key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verschlüsselt Daten mit AES-GCM
 * @param data - Daten als String (wird JSON sein)
 * @param password - Benutzer-Passwort
 * @returns Base64-encodierte verschlüsselte Daten mit Salt und IV
 */
export async function encryptData(data: string, password: string): Promise<string> {
  // Prüfe crypto.subtle Verfügbarkeit
  if (!isCryptoAvailable()) {
    const errorMsg = getCryptoErrorMessage();
    console.error('[crypto] Crypto API nicht verfügbar:', errorMsg);
    throw new Error(errorMsg);
  }
  
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const salt = generateSalt();
    const iv = generateIV();
    const key = await deriveKey(password, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      dataBuffer.buffer as ArrayBuffer
    );

    // Kombiniere: Salt + IV + verschlüsselte Daten
    const combined = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    // Konvertiere zu Base64 (iOS-kompatibel)
    const base64 = arrayBufferToBase64(combined);
    return base64;
  } catch (error) {
    console.error('[crypto] encryptData ERROR:', error);
    console.error('[crypto] Error name:', error instanceof Error ? error.name : 'unknown');
    console.error('[crypto] Error message:', error instanceof Error ? error.message : 'unknown');
    console.error('[crypto] Error stack:', error instanceof Error ? error.stack : 'unknown');
    throw new Error('Verschlüsselung fehlgeschlagen');
  }
}

/**
 * Entschlüsselt Daten mit AES-GCM
 * @param encryptedData - Base64-encodierte verschlüsselte Daten
 * @param password - Benutzer-Passwort
 * @returns Entschlüsselte Daten als String
 */
export async function decryptData(encryptedData: string, password: string): Promise<string> {
  try {
    // Konvertiere von Base64 (iOS-kompatibel)
    const combined = base64ToArrayBuffer(encryptedData);

    // Extrahiere Salt, IV und verschlüsselte Daten
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      encrypted.buffer as ArrayBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Entschlüsselungsfehler:', error);
    throw new Error('Entschlüsselung fehlgeschlagen - falsches Passwort?');
  }
}

/**
 * Testet ob ein Passwort korrekt ist, indem ein Test-String entschlüsselt wird
 */
export async function verifyPassword(encryptedTestData: string, password: string): Promise<boolean> {
  try {
    await decryptData(encryptedTestData, password);
    return true;
  } catch {
    return false;
  }
}

/**
 * Erstellt einen verschlüsselten Test-String zum Verifizieren des Passworts
 */
export async function createPasswordTest(password: string): Promise<string> {
  const testString = 'PASSWORD_VERIFICATION_TEST';
  return await encryptData(testString, password);
}
