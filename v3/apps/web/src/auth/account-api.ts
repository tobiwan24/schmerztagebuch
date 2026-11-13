// Client der Konto-API (DECISIONS A-022). Austauschbar wie der Sync-Transport: Browser `fetch` (Cookie-Sitzung),
// Integrationstests einen Adapter auf `fastify.inject`.
import type { MemberDkWrap } from '@stb/crypto';

export type UserKeyKind = 'identity-pub' | 'identity-priv-enc' | 'umk-wrap-passkey' | 'umk-wrap-backup' | 'backup-verifier';
export interface UserKey {
  kind: UserKeyKind;
  credentialId?: string;
  blob: string;
}
export interface NewDevice {
  nameCt: string;
  publicKey: string;
}
export interface DiaryMembership {
  diaryId: string;
  role: 'owner' | 'editor' | 'viewer';
  keyEpoch: number;
  wrappedDk: string;
}

/** WebAuthn-JSON (wie `PublicKeyCredential.toJSON()`). */
export type CredentialJson = { id: string; rawId: string; type: 'public-key'; response: Record<string, unknown>; [k: string]: unknown };

export interface AccountApi {
  registerOptions(username: string, userId?: string): Promise<{ challengeId: string; options: Record<string, unknown> & { challenge: string; user: { id: string } } }>;
  registerVerify(body: { challengeId: string; username: string; response: CredentialJson; keys: UserKey[]; device: NewDevice }): Promise<{ userId: string; deviceId: string }>;
  loginOptions(): Promise<{ challengeId: string; options: Record<string, unknown> & { challenge: string } }>;
  loginVerify(body: { challengeId: string; response: CredentialJson; device: NewDevice }): Promise<{ userId: string; deviceId: string; keys: UserKey[] }>;
  /** Recovery / Gerät hinzufügen per Backup-Code (A-023). */
  recoveryStart(body: { username: string; backupAuth: string }): Promise<{ challengeId: string; options: Record<string, unknown> & { challenge: string; user: { id: string } }; keys: UserKey[] }>;
  recoveryFinish(body: { challengeId: string; response: CredentialJson; keys: UserKey[]; device: NewDevice }): Promise<{ userId: string; deviceId: string }>;
  createDiary(body: { diaryId: string; wrappedDk: string }): Promise<void>;
  listDiaries(): Promise<DiaryMembership[]>;
}

/** Fehler der Konto-API mit Server-Code (`challenge-expired`, `username-taken`, …) oder `server-unreachable`. */
export class AccountApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'AccountApiError';
  }
}

export const encodeDkWrap = (w: MemberDkWrap): string => JSON.stringify(w);
export const decodeDkWrap = (s: string): MemberDkWrap => JSON.parse(s) as MemberDkWrap;

export function createFetchAccountApi(baseUrl = '', fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): AccountApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method, credentials: 'include', cache: 'no-store',
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch {
      throw new AccountApiError('server-unreachable', 0);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new AccountApiError(err.error ?? `http-${res.status}`, res.status);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  return {
    registerOptions: (username, userId) => call('POST', '/api/v1/auth/register/options', userId ? { username, userId } : { username }),
    registerVerify: (body) => call('POST', '/api/v1/auth/register/verify', body),
    loginOptions: () => call('POST', '/api/v1/auth/login/options', {}),
    loginVerify: (body) => call('POST', '/api/v1/auth/login/verify', body),
    recoveryStart: (body) => call('POST', '/api/v1/auth/recovery/start', body),
    recoveryFinish: (body) => call('POST', '/api/v1/auth/recovery/finish', body),
    createDiary: (body) => call('POST', '/api/v1/diaries', body),
    listDiaries: () => call('GET', '/api/v1/diaries'),
  };
}
