// Authentifizierungs- und Session-Management

import { getSetting, setSetting } from '../db';
import { verifyPassword, createPasswordTest, deriveKey, createPasswordTestWithKey, verifyPasswordWithKey } from './crypto';

export type EncryptionMode = 'none' | 'full';

const PASSWORD_TEST_KEY = 'passwordTest';
const PASSWORD_TEST_V2_KEY = 'passwordTestV2';
const APP_SALT_KEY = 'appSalt';
const ENCRYPTION_MODE_KEY = 'encryptionMode';
const BIOMETRIC_ENABLED_KEY = 'biometricEnabled';
const BIOMETRIC_CREDENTIAL_KEY = 'biometricCredential';
const SESSION_KEY = 'authSession';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 Stunden (Fallback)
export const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 Minuten Inaktivität

/**
 * iOS-kompatible Base64-Encoding
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * iOS-kompatible Base64-Decoding
 */
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface AuthSession {
  password: string;
  keyBytes?: string;  // Base64 der 32-Byte AES-Key-Rohdaten (v2)
  timestamp: number;
}

/**
 * Gibt app_salt zurück (wird einmalig generiert und in Settings gespeichert)
 */
export async function getOrCreateAppSalt(): Promise<Uint8Array> {
  const stored = await getSetting(APP_SALT_KEY);
  if (stored) {
    return base64ToArrayBuffer(stored);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await setSetting(APP_SALT_KEY, arrayBufferToBase64(salt.buffer));
  return salt;
}

/**
 * Importiert den CryptoKey aus der aktuellen Session (v2)
 */
export async function getSessionKey(): Promise<CryptoKey | null> {
  if (!isSessionValid()) return null;
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return null;

  try {
    const session: AuthSession = JSON.parse(data);
    if (!session.keyBytes) return null;

    const keyBytes = base64ToArrayBuffer(session.keyBytes);
    return await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

/**
 * Setzt das Passwort (speichert verschlüsselten Test-String, v1 + v2)
 */
export async function setPassword(password: string): Promise<void> {
  const testData = await createPasswordTest(password);
  await setSetting(PASSWORD_TEST_KEY, testData);

  const appSalt = await getOrCreateAppSalt();
  const key = await deriveKey(password, appSalt, false);
  const testDataV2 = await createPasswordTestWithKey(key);
  await setSetting(PASSWORD_TEST_V2_KEY, testDataV2);
}

/**
 * Prüft ob ein Passwort gesetzt ist
 */
export async function hasPassword(): Promise<boolean> {
  const testData = await getSetting(PASSWORD_TEST_KEY);
  return testData !== undefined;
}

/**
 * Verifiziert ein Passwort (v2 zuerst, Fallback auf v1)
 */
export async function checkPassword(password: string): Promise<boolean> {
  const testDataV2 = await getSetting(PASSWORD_TEST_V2_KEY);
  if (testDataV2) {
    try {
      const appSalt = await getOrCreateAppSalt();
      const key = await deriveKey(password, appSalt, false);
      return await verifyPasswordWithKey(testDataV2, key);
    } catch {
      return false;
    }
  }

  const testData = await getSetting(PASSWORD_TEST_KEY);
  if (!testData) return false;
  return await verifyPassword(testData, password);
}

/**
 * Setzt den Verschlüsselungsmodus
 */
export async function setEncryptionMode(mode: EncryptionMode): Promise<void> {
  await setSetting(ENCRYPTION_MODE_KEY, mode);
}

/**
 * Gibt den aktuellen Verschlüsselungsmodus zurück
 */
export async function getEncryptionMode(): Promise<EncryptionMode> {
  const mode = await getSetting(ENCRYPTION_MODE_KEY);
  return (mode as EncryptionMode) || 'none';
}

/**
 * Speichert Passwort + PBKDF2-Key in SessionStorage (einmalige Key-Ableitung)
 */
export async function setSession(password: string): Promise<void> {
  const appSalt = await getOrCreateAppSalt();
  const key = await deriveKey(password, appSalt, true);  // extractable=true für Export
  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyBytes = arrayBufferToBase64(rawKey);

  const session: AuthSession = {
    password,
    keyBytes,
    timestamp: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Prüft ob Session noch gültig ist
 */
export function isSessionValid(): boolean {
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return false;

  try {
    const session: AuthSession = JSON.parse(data);
    const elapsed = Date.now() - session.timestamp;
    
    if (elapsed > SESSION_TIMEOUT) {
      clearSession();
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Gibt Passwort aus Session zurück
 */
export function getSessionPassword(): string | null {
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return null;

  try {
    const session: AuthSession = JSON.parse(data);
    return session.password;
  } catch {
    return null;
  }
}

/**
 * Löscht Session
 */
export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Aktualisiert Session-Timestamp (bei Aktivität) — kein erneutes Key-Ableiten
 */
export function refreshSession(): void {
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return;
  try {
    const session: AuthSession = JSON.parse(data);
    session.timestamp = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

/**
 * Prüft ob Auth für eine View erforderlich ist
 */
export async function requiresAuth(_view: 'diary' | 'history' | 'editor'): Promise<boolean> {
  const mode = await getEncryptionMode();
  
  // Bei 'full' ist IMMER Auth erforderlich (wird beim App-Start gemacht)
  // Bei 'none' ist NIE Auth erforderlich
  if (mode === 'none') return false;
  if (mode === 'full') return true;
  
  return false;
}

/**
 * Validiert Passwortstärke
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Mindestens 8 Zeichen');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Mindestens 1 Großbuchstabe');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Mindestens 1 Kleinbuchstabe');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Mindestens 1 Zahl');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ========== BIOMETRIE (WebAuthn) ==========

/**
 * Prüft ob Biometrie verfügbar ist
 */
export function isBiometricAvailable(): boolean {
  // Basis-Check: Browser-Support
  if (!(window.PublicKeyCredential && navigator.credentials)) {
    return false;
  }
  
  // iOS/Safari Check: Nur auf echten Domains (nicht IP/localhost)
  const hostname = window.location.hostname;
  const isValidDomain = hostname !== 'localhost' && 
                        hostname !== '127.0.0.1' && 
                        !hostname.match(/^\d+\.\d+\.\d+\.\d+$/);
  
  if (!isValidDomain) {
    console.log('[auth] Biometrie nicht verfügbar - keine valide Domain:', hostname);
    return false;
  }
  
  return true;
}

/**
 * Prüft ob Biometrie aktiviert ist
 */
export async function isBiometricEnabled(): Promise<boolean> {
  const enabled = await getSetting(BIOMETRIC_ENABLED_KEY);
  return enabled === 'true';
}

/**
 * Aktiviert/Deaktiviert Biometrie
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await setSetting(BIOMETRIC_ENABLED_KEY, String(enabled));
}

/**
 * Registriert Biometrie-Credential
 */
export async function registerBiometric(password: string): Promise<boolean> {
  if (!isBiometricAvailable()) {
    throw new Error('Biometrie nicht verfügbar');
  }

  try {
    // Challenge generieren
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // RP ID bestimmen (iOS braucht entweder keine ID oder valide Domain)
    const hostname = window.location.hostname;
    const rpConfig: { name: string; id?: string } = {
      name: 'Schmerztagebuch',
    };
    
    // Nur bei echten Domains (nicht localhost/IP) die ID setzen
    if (hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      rpConfig.id = hostname;
    }

    // Credential erstellen
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: rpConfig,
        user: {
          id: new TextEncoder().encode('user-' + Date.now()),
          name: 'user@schmerztagebuch',
          displayName: 'Schmerztagebuch User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      return false;
    }

    // Credential-ID speichern (iOS-kompatibel)
    const credentialId = arrayBufferToBase64(credential.rawId);
    await setSetting(BIOMETRIC_CREDENTIAL_KEY, credentialId);

    // Passwort mit Credential verknüpfen (in Session speichern)
    sessionStorage.setItem('biometric_password', password);

    await setBiometricEnabled(true);
    return true;
  } catch (error) {
    console.error('Biometrie-Registrierung fehlgeschlagen:', error);
    return false;
  }
}

/**
 * Authentifiziert mit Biometrie
 */
export async function authenticateWithBiometric(): Promise<string | null> {
  if (!isBiometricAvailable()) {
    throw new Error('Biometrie nicht verfügbar');
  }

  const credentialIdBase64 = await getSetting(BIOMETRIC_CREDENTIAL_KEY);
  if (!credentialIdBase64) {
    throw new Error('Keine Biometrie-Daten gefunden');
  }

  try {
    // Challenge generieren
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Credential-ID dekodieren (iOS-kompatibel)
    const credentialId = base64ToArrayBuffer(credentialIdBase64);

    // Authentifizieren
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          id: credentialId.buffer as ArrayBuffer,
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    if (!assertion) {
      return null;
    }

    // Passwort aus Session holen
    const password = sessionStorage.getItem('biometric_password');
    if (!password) {
      throw new Error('Passwort nicht gefunden - bitte mit Passwort anmelden');
    }

    return password;
  } catch (error) {
    console.error('Biometrie-Authentifizierung fehlgeschlagen:', error);
    return null;
  }
}

/**
 * Deaktiviert Biometrie
 */
export async function disableBiometric(): Promise<void> {
  await setBiometricEnabled(false);
  await setSetting(BIOMETRIC_CREDENTIAL_KEY, '');
  sessionStorage.removeItem('biometric_password');
}
