// Quelle 2 (Spec 11): v2-Server-Pull, nur lesend. Login wie v2 (`server/src/routes/auth.ts`): Passkey mit PRF
// (`login-options` → `login-verify` → `wrapped_dek_passkey`) oder v2-Backup-Code (`salt` → `recover` → `wrapped_dek_backup`).
// Danach `GET /api/sync/pull?since=0` und Zusammenführung mit der lokalen PainDiaryDB über `syncId` (neueres `updatedAt`
// gewinnt — wie v2). Es wird nie etwas an den v2-Server geschrieben.
import type { V2Template } from '@stb/core';
import { credentialToJson, requestOptionsFromServer } from '@/auth/webauthn-json';
import { prfOutput, type CredentialsLike } from '@/auth/passkey';
import { fromBase64, normalizeV2BackupCode, toBase64, unwrapDekWithBackupCode, unwrapDekWithPrf } from './crypto';
import type { V2EntryRow, V2Snapshot } from './source';

/** v2-PRF-Eval-Salt (v2 `src/utils/webauthnPrf.ts`). */
export const V2_PRF_SALT = new Uint8Array(32).map((_, i) => 'schmerztagebuch-prf-eval-salt-v1'.charCodeAt(i));

export interface V2TemplateRecord {
  syncId: string;
  name: string | null;
  order: number | null;
  icon: string | null;
  color: string | null;
  blocks: string | null;
  updatedAt: string;
  deleted: boolean;
}

export interface V2EntryRecord {
  syncId: string;
  templateSyncId: string | null;
  timestamp: string | null;
  editedAt: string | null;
  tags: string[];
  encrypted: boolean;
  data: string | null;
  updatedAt: string;
  deleted: boolean;
}

export interface V2PullResult {
  templates: V2TemplateRecord[];
  entries: V2EntryRecord[];
  cursor: number;
}

export class V2ServerError extends Error {
  constructor(readonly code: 'unreachable' | 'unknown-user' | 'wrong-backup-code' | 'login-failed' | 'pull-failed', message: string) {
    super(message);
    this.name = 'V2ServerError';
  }
}

export interface V2Api {
  salt(username: string): Promise<string>;
  loginOptions(username: string): Promise<Record<string, unknown>>;
  loginVerify(username: string, response: unknown): Promise<string>;
  recover(username: string, authVerifier: string): Promise<string>;
  pull(since: number): Promise<V2PullResult>;
}

/** HTTP-Client für die v2-API (gleicher Origin oder `baseUrl`, Cookie-Sitzung). */
export function createV2Api(baseUrl = '', fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): V2Api {
  async function call<T>(path: string, init: RequestInit, onError: (status: number) => V2ServerError): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, { credentials: 'include', cache: 'no-store', ...init });
    } catch {
      throw new V2ServerError('unreachable', 'v2-Server nicht erreichbar');
    }
    if (!res.ok) throw onError(res.status);
    return (await res.json()) as T;
  }
  const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return {
    async salt(username) {
      const r = await call<{ kdf_salt: string }>(`/api/auth/salt?${new URLSearchParams({ username })}`, { method: 'GET' }, (s) =>
        s === 404 ? new V2ServerError('unknown-user', 'v2-Benutzer unbekannt') : new V2ServerError('login-failed', `HTTP ${s}`),
      );
      return r.kdf_salt;
    },
    loginOptions: (username) =>
      call(`/api/auth/webauthn/login-options?${new URLSearchParams({ username })}`, { method: 'POST' }, (s) => new V2ServerError(s === 404 ? 'unknown-user' : 'login-failed', `HTTP ${s}`)),
    async loginVerify(username, response) {
      const r = await call<{ wrapped_dek_passkey: string }>('/api/auth/webauthn/login-verify', json({ username, response }), (s) => new V2ServerError('login-failed', `HTTP ${s}`));
      return r.wrapped_dek_passkey;
    },
    async recover(username, authVerifier) {
      const r = await call<{ wrapped_dek_backup: string }>('/api/auth/recover', json({ username, authVerifier }), (s) =>
        s === 401 ? new V2ServerError('wrong-backup-code', 'v2-Backup-Code falsch') : new V2ServerError('login-failed', `HTTP ${s}`),
      );
      return r.wrapped_dek_backup;
    },
    pull: (since) => call<V2PullResult>(`/api/sync/pull?since=${since}`, { method: 'GET' }, (s) => new V2ServerError('pull-failed', `HTTP ${s}`)),
  };
}

/** v2 `deriveBackupAuthVerifier`: HKDF(Code, kdfSalt, 'recovery-auth-v1') → 256 Bit, Base64. */
export async function deriveV2BackupAuthVerifier(code: string, kdfSaltB64: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeV2BackupCode(code)), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: fromBase64(kdfSaltB64), info: new TextEncoder().encode('recovery-auth-v1') }, base, 256);
  return toBase64(new Uint8Array(bits));
}

/** Login mit v2-Backup-Code → DEK. */
export async function v2LoginWithBackupCode(api: V2Api, username: string, code: string): Promise<CryptoKey> {
  const salt = await api.salt(username);
  const wrapped = await api.recover(username, await deriveV2BackupAuthVerifier(code, salt));
  return unwrapDekWithBackupCode(wrapped, code, salt);
}

/** WebAuthn-Optionen mit dem v2-PRF-Salt (vorab bauen; `credentials.get` muss im Klick-Handler starten). */
export function v2RequestOptions(serverOptions: Record<string, unknown>): CredentialRequestOptions {
  const o = requestOptionsFromServer(serverOptions);
  return { publicKey: { ...o.publicKey!, extensions: { ...o.publicKey!.extensions, prf: { eval: { first: V2_PRF_SALT } } } as AuthenticationExtensionsClientInputs } };
}

/** Login mit dem v2-Passkey (PRF) → DEK. `options` aus `v2RequestOptions`, Aufruf direkt aus der Nutzergeste. */
export async function v2LoginWithPasskey(api: V2Api, credentials: CredentialsLike, username: string, options: CredentialRequestOptions): Promise<CryptoKey> {
  const cred = await credentials.get(options);
  const prf = prfOutput(cred);
  const wrapped = await api.loginVerify(username, credentialToJson(cred!));
  return unwrapDekWithPrf(wrapped, prf);
}

/** Alle Datensätze vom v2-Server (der Server liefert alles mit `server_seq > since` in einer Antwort). */
export async function pullAllV2(api: V2Api): Promise<V2PullResult> {
  return api.pull(0);
}

// ---------------------------------------------------------------------------------------------------------------
// Zusammenführen (Quelle 1 + 2)

const newer = (a: string | undefined, b: string | undefined) => Date.parse(b ?? '') > Date.parse(a ?? '');

/**
 * Lokaler Schnappschuss + Server-Stand → ein Schnappschuss. Gleiche `syncId`: neueres `updatedAt` gewinnt. Nur auf dem
 * Server vorhandene Vorlagen/Einträge bekommen negative lokale IDs; Server-Einträge sind immer mit dem DEK verschlüsselt
 * (v2-Cloud-Migration), daher `encryptionVersion: 2`, `encryptionSource: 'cloud'`.
 */
export function mergeV2(local: V2Snapshot, remote: V2PullResult): V2Snapshot {
  const templates = [...local.templates];
  const templateIdBySync = new Map<string, number>(templates.filter((t) => t.syncId).map((t) => [t.syncId!, t.id]));
  let nextId = -1;
  for (const r of remote.templates) {
    const blocks = r.blocks ? (JSON.parse(r.blocks) as V2Template['blocks']) : [];
    const fromServer: Omit<V2Template, 'id'> = {
      name: r.name ?? 'Vorlage', order: r.order ?? 0, blocks, syncId: r.syncId, updatedAt: r.updatedAt, deleted: r.deleted,
      ...(r.icon ? { icon: r.icon } : {}), ...(r.color ? { color: r.color } : {}),
    };
    const i = templates.findIndex((t) => t.syncId === r.syncId);
    if (i < 0) {
      const id = nextId--;
      templates.push({ id, ...fromServer });
      templateIdBySync.set(r.syncId, id);
    } else if (newer(templates[i]!.updatedAt, r.updatedAt)) {
      templates[i] = { id: templates[i]!.id, ...fromServer };
    }
  }

  const entries: V2EntryRow[] = [...local.entries];
  for (const r of remote.entries) {
    if (!r.data || !r.timestamp) continue;
    const templateId = r.templateSyncId ? templateIdBySync.get(r.templateSyncId) : undefined;
    const i = entries.findIndex((e) => e.syncId === r.syncId);
    const row = (id: number, fallbackTemplate: number): V2EntryRow => ({
      id, templateId: templateId ?? fallbackTemplate, timestamp: new Date(r.timestamp!).toISOString(), encrypted: r.encrypted, data: r.data!,
      tags: r.tags, ...(r.editedAt ? { editedAt: r.editedAt } : {}), ...(r.encrypted ? { encryptionVersion: 2, encryptionSource: 'cloud' as const } : {}),
      syncId: r.syncId, updatedAt: r.updatedAt, deleted: r.deleted,
    });
    if (i < 0) entries.push(row(nextId--, templateId ?? 0));
    else if (newer(entries[i]!.updatedAt, r.updatedAt)) entries[i] = row(entries[i]!.id, entries[i]!.templateId);
  }
  return { ...local, templates, entries };
}
