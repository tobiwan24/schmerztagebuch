// src/services/cloudSyncApi.ts
// Dünner Fetch-Client für das Cloud-Sync-Backend (Single-Origin `/api/*`, Session-Cookie).
// Endpunkt-Pfade und JSON-Feldnamen folgen 1:1 dem "API-Grobdesign"-Abschnitt der Spec
// (_planning/schmerztagebuch-cloud-spec.md) — das Backend wird parallel exakt gegen
// diesen Vertrag gebaut, siehe Abschlussbericht für dokumentierte Interpretationen an
// Stellen, an denen die Spec das Request-Body-Format nicht exakt vorgibt.

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

const API_BASE = '/api';

export class CloudApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    let message = `Server-Fehler (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // kein JSON-Body — Standardmeldung verwenden
    }
    throw new CloudApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function getKdfSalt(username: string): Promise<{ kdf_salt: string }> {
  return apiFetch(`/auth/salt?username=${encodeURIComponent(username)}`);
}

export async function getRegistrationOptions(username: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return apiFetch('/auth/webauthn/register-options', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

/**
 * `wrapped_dek_passkey` wird laut Spec "zusammen mit credential_id + public_key" persistiert
 * (neuer Eintrag in `credentials`) — daher hier Teil desselben register-verify-Aufrufs statt
 * eines separaten Requests (die Spec listet dafür keinen eigenen Endpunkt).
 */
export async function verifyRegistration(
  username: string,
  response: RegistrationResponseJSON,
  wrappedDekPasskey: string
): Promise<{ userId: string; username: string }> {
  return apiFetch('/auth/webauthn/register-verify', {
    method: 'POST',
    body: JSON.stringify({ username, response, wrapped_dek_passkey: wrappedDekPasskey }),
  });
}

/** Speichert backup_auth_hash + wrapped_dek_backup + kdf_salt beim Server (Pflichtschritt nach Passkey-Enrollment). */
export async function initBackupCode(params: {
  authVerifier: string;
  wrapped_dek_backup: string;
  kdf_salt: string;
}): Promise<void> {
  await apiFetch('/auth/backup-code/init', { method: 'POST', body: JSON.stringify(params) });
}

export async function getLoginOptions(username: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return apiFetch(`/auth/webauthn/login-options?username=${encodeURIComponent(username)}`, { method: 'POST' });
}

export async function verifyLogin(
  username: string,
  response: AuthenticationResponseJSON
): Promise<{ wrapped_dek_passkey: string }> {
  return apiFetch('/auth/webauthn/login-verify', {
    method: 'POST',
    body: JSON.stringify({ username, response }),
  });
}

export async function recoverWithBackupCode(
  username: string,
  authVerifier: string
): Promise<{ wrapped_dek_backup: string }> {
  return apiFetch('/auth/recover', {
    method: 'POST',
    body: JSON.stringify({ username, authVerifier }),
  });
}

/** Ersetzt den alten Backup-Code (alter Code wird serverseitig invalidiert). Nutzt den bestehenden kdf_salt. */
export async function rotateBackupCode(params: {
  authVerifier: string;
  wrapped_dek_backup: string;
}): Promise<void> {
  await apiFetch('/auth/backup-code/rotate', { method: 'POST', body: JSON.stringify(params) });
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<{ userId: string; username: string } | null> {
  try {
    return await apiFetch('/auth/me');
  } catch (err) {
    if (err instanceof CloudApiError && err.status === 401) return null;
    throw err;
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────

/**
 * Ein Template-Record auf der Leitung: name/order/icon/color bleiben Klartext
 * (Datenmodell-Mapping der Spec kennzeichnet nur `blocks` als "(verschlüsselt)"),
 * `data` ist der AES-GCM-Ciphertext von JSON.stringify(blocks) mit dem DEK.
 */
export interface SyncTemplateDTO {
  syncId: string;
  name: string;
  order: number;
  icon?: string;
  color?: string;
  data: string;
  updatedAt: string;
  deleted: boolean;
}

/**
 * Ein Entry-Record auf der Leitung. `tags` bleiben bewusst Klartext (Entscheidungstabelle #7),
 * `data` ist immer der AES-GCM-Ciphertext (Kernentscheidung: Server sieht nie Klartext).
 * `templateSyncId` referenziert das Template über dessen syncId (nicht die lokale numerische id).
 */
export interface SyncEntryDTO {
  syncId: string;
  templateSyncId: string;
  timestamp: string;
  editedAt?: string;
  tags: string[];
  data: string;
  updatedAt: string;
  deleted: boolean;
}

export interface SyncPullResult {
  templates: SyncTemplateDTO[];
  entries: SyncEntryDTO[];
  cursor: string;
}

export interface SyncPushResult {
  applied: string[];
  conflicts: string[];
  cursor: string;
}

export async function pullSync(since: string | null): Promise<SyncPullResult> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return apiFetch(`/sync/pull${qs}`);
}

export async function pushSync(templates: SyncTemplateDTO[], entries: SyncEntryDTO[]): Promise<SyncPushResult> {
  return apiFetch('/sync/push', { method: 'POST', body: JSON.stringify({ templates, entries }) });
}
