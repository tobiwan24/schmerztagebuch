// HTTP-Client für Einladungen und Mitglieder (Spec 09 „Server-Endpunkte"). Das Einladungs-Geheimnis wird nie gesendet.
import type { InvitationApi, PendingAcceptance } from './invitations.js';
import type { MembershipApi } from './leave.js';

export interface Member {
  principalId: string;
  role: 'owner' | 'editor' | 'viewer';
  username: string;
  identityPub: string | null;
  /** Editor darf Vorlagen bearbeiten (SHR-14); fehlt bei älteren Server-/Cache-Ständen. */
  canEditTemplates?: boolean;
}

export class SharingError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'SharingError';
  }
}

export interface SharingApi extends InvitationApi, MembershipApi {
  createInvitation(diaryId: string, body: { role: 'editor' | 'viewer'; ciphertext: string }): Promise<{ id: string }>;
  readInvitation(id: string): Promise<{ id: string; diaryId: string; ciphertext: string; expiresAt: number }>;
  acceptInvitation(id: string, body: { identityPub: string; mac: string }): Promise<void>;
  revokeInvitation(id: string): Promise<void>;
  listMembers(diaryId: string): Promise<Member[]>;
  changeRole(diaryId: string, principalId: string, role: Member['role']): Promise<void>;
  setCanEditTemplates(diaryId: string, principalId: string, canEditTemplates: boolean): Promise<void>;
  removeMember(diaryId: string, principalId: string): Promise<void>;
}

export function createSharingApi(baseUrl = '', fetchFn: typeof fetch = globalThis.fetch.bind(globalThis), self?: () => Promise<string>): SharingApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method, credentials: 'include', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `http-${res.status}`;
      throw new SharingError(res.status, code);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  const enc = encodeURIComponent;
  return {
    createInvitation: (diaryId, body) => call('POST', `/api/v1/diaries/${enc(diaryId)}/invitations`, body),
    readInvitation: (id) => call('GET', `/api/v1/invitations/${enc(id)}`),
    acceptInvitation: (id, body) => call('POST', `/api/v1/invitations/${enc(id)}/accept`, body),
    revokeInvitation: (id) => call('DELETE', `/api/v1/invitations/${enc(id)}`),
    listPending: (diaryId) => call<PendingAcceptance[]>('GET', `/api/v1/diaries/${enc(diaryId)}/invitations`),
    confirm: (diaryId, invitationId, wrappedDk) => call('POST', `/api/v1/diaries/${enc(diaryId)}/members`, { invitationId, wrappedDk }),
    listMembers: (diaryId) => call('GET', `/api/v1/diaries/${enc(diaryId)}/members`),
    changeRole: (diaryId, principalId, role) => call('PATCH', `/api/v1/diaries/${enc(diaryId)}/members/${enc(principalId)}`, { role }),
    setCanEditTemplates: (diaryId, principalId, canEditTemplates) => call('PATCH', `/api/v1/diaries/${enc(diaryId)}/members/${enc(principalId)}`, { canEditTemplates }),
    removeMember: (diaryId, principalId) => call('DELETE', `/api/v1/diaries/${enc(diaryId)}/members/${enc(principalId)}`),
    async leave(diaryId) {
      if (!self) throw new Error('Austreten braucht die eigene User-ID');
      await call('DELETE', `/api/v1/diaries/${enc(diaryId)}/members/${enc(await self())}`);
    },
  };
}
