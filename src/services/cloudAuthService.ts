// src/services/cloudAuthService.ts
// Orchestriert den Cloud-Sync-Auth-Lifecycle: Registrierung (Passkey + Pflicht-Backup-Code),
// Alltags-Login (Passkey), Recovery (Backup-Code), Rotation. Verwaltet außerdem die
// Cloud-Session (DEK-Caching in sessionStorage — analog zum bestehenden lokalen
// Passwort-Session-Muster in utils/auth.ts, INTERPRETATION: siehe Abschlussbericht)
// und die gerätelokalen Settings-Flags (nicht Teil des Cloud-Sync selbst, siehe
// Entscheidungstabelle #6 der Spec: Settings sind gerätelokal, nicht synchronisiert).
//
// WICHTIG: Cloud-Sync ist ein eigenständiger, paralleler Schutzmechanismus zur
// bestehenden lokalen Passwort-Verschlüsselung (utils/auth.ts / encryptionMode).
// Nutzer ohne Cloud-Sync sind von diesem Modul komplett unberührt.

import { getSetting, setSetting } from '../db';
import {
  generateDEK, exportDEKRaw, importDEKRaw,
  deriveKekFromPrf, deriveBackupAuthVerifier, deriveKekFromBackupCode,
  wrapDEK, unwrapDEK, generateKdfSalt, generateBackupCode,
} from '../utils/keyManagement';
import { registerPasskeyWithPrf, authenticatePasskeyWithPrf } from '../utils/webauthnPrf';
import * as api from './cloudSyncApi';

const CLOUD_ENABLED_KEY = 'cloudSyncEnabled';
const CLOUD_USERNAME_KEY = 'cloudUsername';
const CLOUD_SESSION_KEY = 'cloudDekSession';
const CLOUD_SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24h, analog zur lokalen Passwort-Session (auth.ts)

interface CloudSessionData {
  dekBase64: string;
  timestamp: number;
}

// ── Gerätelokale Settings ─────────────────────────────────────────────────────

export async function isCloudSyncEnabled(): Promise<boolean> {
  return (await getSetting(CLOUD_ENABLED_KEY)) === 'true';
}

export async function getCloudUsername(): Promise<string | null> {
  return (await getSetting(CLOUD_USERNAME_KEY)) ?? null;
}

async function setCloudLinked(username: string): Promise<void> {
  await setSetting(CLOUD_ENABLED_KEY, 'true');
  await setSetting(CLOUD_USERNAME_KEY, username);
}

/** Trennt dieses Gerät lokal von der Cloud (Server-Account bleibt bestehen, keine Datenlöschung). */
export async function unlinkCloudDevice(): Promise<void> {
  await setSetting(CLOUD_ENABLED_KEY, 'false');
  clearCloudSession();
}

// ── Cloud-Session (DEK-Caching, gerätelokal, DEK verlässt das Gerät NIE unverpackt) ──────────

export async function setCloudSession(dek: CryptoKey): Promise<void> {
  const dekBase64 = await exportDEKRaw(dek);
  const session: CloudSessionData = { dekBase64, timestamp: Date.now() };
  sessionStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
}

export function isCloudSessionValid(): boolean {
  const raw = sessionStorage.getItem(CLOUD_SESSION_KEY);
  if (!raw) return false;
  try {
    const session: CloudSessionData = JSON.parse(raw);
    if (Date.now() - session.timestamp > CLOUD_SESSION_TIMEOUT) {
      clearCloudSession();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getCloudSessionDEK(): Promise<CryptoKey | null> {
  if (!isCloudSessionValid()) return null;
  const raw = sessionStorage.getItem(CLOUD_SESSION_KEY);
  if (!raw) return null;
  try {
    const session: CloudSessionData = JSON.parse(raw);
    return await importDEKRaw(session.dekBase64);
  } catch {
    return null;
  }
}

export function refreshCloudSession(): void {
  const raw = sessionStorage.getItem(CLOUD_SESSION_KEY);
  if (!raw) return;
  try {
    const session: CloudSessionData = JSON.parse(raw);
    session.timestamp = Date.now();
    sessionStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearCloudSession(): void {
  sessionStorage.removeItem(CLOUD_SESSION_KEY);
}

// ── Registrierung (Passkey + Pflicht-Backup-Code) ─────────────────────────────

export interface RegisterAccountResult {
  dek: CryptoKey;
}

/**
 * Schritt 1: Passkey-Registrierung + DEK-Erzeugung + Wrapping mit KEK_passkey.
 * Setzt die Cloud-Session, damit die App sofort mit dem DEK weiterarbeiten kann.
 * Der Backup-Code (Pflichtschritt, kein Überspringen) folgt separat über
 * generateAndRegisterBackupCode().
 */
export async function registerAccount(username: string): Promise<RegisterAccountResult> {
  const optionsJSON = await api.getRegistrationOptions(username);
  const { response, prfOutput } = await registerPasskeyWithPrf(optionsJSON);

  if (!prfOutput) {
    throw new Error(
      'Der Passkey liefert kein PRF-Ergebnis. Bitte Face ID/iCloud-Schlüsselbund als Plattform-' +
      'Passkey verwenden (siehe Spec: PRF gilt für Plattform-Authenticator als stabil, Stand iOS 26.6).'
    );
  }

  const dek = await generateDEK();
  const kek = await deriveKekFromPrf(prfOutput);
  const wrappedDekPasskey = await wrapDEK(dek, kek);

  await api.verifyRegistration(username, response, wrappedDekPasskey);

  await setCloudLinked(username);
  await setCloudSession(dek);

  return { dek };
}

export interface BackupCodeSetupResult {
  /** Klartext-Code — nur zur einmaligen Anzeige/Download, wird an keiner Stelle persistiert. */
  backupCode: string;
}

/**
 * Schritt 2 (Pflicht, direkt nach Passkey-Registrierung, kein Überspringen möglich):
 * Backup-Code generieren, authVerifier + wrapped_dek_backup + kdf_salt an den Server übertragen.
 */
export async function generateAndRegisterBackupCode(dek: CryptoKey): Promise<BackupCodeSetupResult> {
  const backupCode = generateBackupCode();
  const kdfSalt = generateKdfSalt();

  const authVerifier = await deriveBackupAuthVerifier(backupCode, kdfSalt);
  const kekBackup = await deriveKekFromBackupCode(backupCode, kdfSalt);
  const wrappedDekBackup = await wrapDEK(dek, kekBackup);

  await api.initBackupCode({ authVerifier, wrapped_dek_backup: wrappedDekBackup, kdf_salt: kdfSalt });

  return { backupCode };
}

/** Rotation (Settings): neuer Backup-Code, alter wird serverseitig invalidiert. Erfordert eine gültige Cloud-Session. */
export async function rotateBackupCode(): Promise<BackupCodeSetupResult> {
  const dek = await getCloudSessionDEK();
  if (!dek) throw new Error('Keine aktive Cloud-Session — bitte erneut mit Passkey anmelden.');
  const username = await getCloudUsername();
  if (!username) throw new Error('Kein Cloud-Account auf diesem Gerät verknüpft.');

  const { kdf_salt: kdfSalt } = await api.getKdfSalt(username);
  const backupCode = generateBackupCode();
  const authVerifier = await deriveBackupAuthVerifier(backupCode, kdfSalt);
  const kekBackup = await deriveKekFromBackupCode(backupCode, kdfSalt);
  const wrappedDekBackup = await wrapDEK(dek, kekBackup);

  await api.rotateBackupCode({ authVerifier, wrapped_dek_backup: wrappedDekBackup });

  return { backupCode };
}

// ── Alltags-Login (Passkey) ────────────────────────────────────────────────────

export async function loginWithPasskey(username: string): Promise<CryptoKey> {
  const optionsJSON = await api.getLoginOptions(username);
  const { response, prfOutput } = await authenticatePasskeyWithPrf(optionsJSON);

  if (!prfOutput) {
    throw new Error('Der Passkey liefert kein PRF-Ergebnis — Entschlüsselung nicht möglich.');
  }

  const { wrapped_dek_passkey } = await api.verifyLogin(username, response);
  const kek = await deriveKekFromPrf(prfOutput);
  const dek = await unwrapDEK(wrapped_dek_passkey, kek);

  await setCloudLinked(username);
  await setCloudSession(dek);

  return dek;
}

// ── Recovery (Backup-Code, neues Gerät ohne Passkey) ────────────────────────────

export async function recoverWithBackupCode(username: string, backupCode: string): Promise<CryptoKey> {
  const { kdf_salt: kdfSalt } = await api.getKdfSalt(username);
  const authVerifier = await deriveBackupAuthVerifier(backupCode, kdfSalt);
  const { wrapped_dek_backup } = await api.recoverWithBackupCode(username, authVerifier);
  const kekBackup = await deriveKekFromBackupCode(backupCode, kdfSalt);
  const dek = await unwrapDEK(wrapped_dek_backup, kekBackup);

  await setCloudLinked(username);
  await setCloudSession(dek);

  return dek;
}

export async function logoutFromCloud(): Promise<void> {
  try {
    await api.logout();
  } catch {
    // Server-Session evtl. schon abgelaufen — lokale Session trotzdem verwerfen
  }
  clearCloudSession();
}
