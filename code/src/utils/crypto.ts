// Verschlüsselungs-Utilities für das Schmerztagebuch
// Verwendet Web Crypto API (AES-GCM) + PBKDF2 für Key Derivation

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;

/**
 * Prüft ob crypto.subtle verfügbar ist (nur über HTTPS oder localhost)
 */
function isCryptoAvailable(): boolean {
  return !!(window.crypto && window.crypto.subtle);
}

/**
 * Gibt Hilfetext für fehlende crypto.subtle API
 */
function getCryptoErrorMessage(): string {
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
function arrayBufferToBase64(buffer: Uint8Array): string {
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
function base64ToArrayBuffer(base64: string): Uint8Array {
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
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
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
    false,
    ['encrypt', 'decrypt']
  );
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
    console.log('[crypto] encryptData START - data length:', data.length);
    console.log('[crypto] Protocol:', window.location.protocol, 'Hostname:', window.location.hostname);
    
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    console.log('[crypto] TextEncoder OK - buffer length:', dataBuffer.length);

    const salt = generateSalt();
    console.log('[crypto] Salt generated - length:', salt.length);
    
    const iv = generateIV();
    console.log('[crypto] IV generated - length:', iv.length);
    
    console.log('[crypto] Deriving key...');
    const key = await deriveKey(password, salt);
    console.log('[crypto] Key derived OK');

    console.log('[crypto] Encrypting...');
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      dataBuffer.buffer as ArrayBuffer
    );
    console.log('[crypto] Encryption OK - encrypted length:', encryptedBuffer.byteLength);

    // Kombiniere: Salt + IV + verschlüsselte Daten
    const combined = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);
    console.log('[crypto] Combined array - length:', combined.length);

    // Konvertiere zu Base64 (iOS-kompatibel)
    console.log('[crypto] Converting to Base64...');
    const base64 = arrayBufferToBase64(combined);
    console.log('[crypto] Base64 conversion OK - length:', base64.length);
    
    console.log('[crypto] encryptData SUCCESS');
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
