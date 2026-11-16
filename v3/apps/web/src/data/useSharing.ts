// Teilen (Spec 09): Mitglieder, Einladungen, Sicherheitsnummer, Annahme. Ansichten greifen nur hierüber zu (Spec 01).
import { useCallback } from 'react';
import { safetyNumber } from '@stb/crypto';
import { useAuth } from '@/auth/AuthContext';
import { isCloudAccount } from '@/auth/cloud-account';
import { loadAccount } from '@/auth/local-account';
import { createSharingApi, type Member } from '@/sharing/api';
import { acceptInvitationWith, createInvitationLink, INVITATION_SECRET_KIND, openInvitation, type InvitationSecretRecord } from '@/sharing/flow';
import { leaveDiary } from '@/sharing/leave';
import { useData } from './DataContext';
import { loadMembers, saveMembers } from './members-cache';
import { useSync } from './SyncContext';
import { useQuery } from './useQuery';

async function self(db: ReturnType<typeof useAuth>['db']) {
  const account: unknown = await loadAccount(db);
  return isCloudAccount(account) ? { userId: account.cloud.userId, username: account.cloud.username, identityPub: account.cloud.identityPublicKey } : null;
}

export interface MemberView extends Member {
  me: boolean;
  /** Sicherheitsnummer gegenüber mir (12 Gruppen), `null` für mich selbst oder ohne Key. */
  safety: string[] | null;
}

export function useMembers(diaryId: string) {
  const { db } = useAuth();
  const { records, diary, now } = useData();
  const sync = useSync();
  const query = useQuery(async () => {
    const me = await self(db);
    const d = await diary.getDiary(diaryId);
    if (!me || !d) return { cloud: false as const, diaryName: d?.name ?? '' };
    const api = createSharingApi('', undefined, async () => me.userId);
    const members = await api.listMembers(diaryId).then(
      async (m) => (await saveMembers(db, diaryId, m), m),
      () => loadMembers(db, diaryId),
    );
    const views: MemberView[] = await Promise.all(
      members.map(async (m) => ({ ...m, me: m.principalId === me.userId, safety: m.principalId !== me.userId && m.identityPub ? await safetyNumber(me.identityPub, m.identityPub) : null })),
    );
    const myRole = views.find((v) => v.me)?.role ?? 'owner';
    const invitations = (await records.list(diaryId, INVITATION_SECRET_KIND)).map((r) => r.payload as InvitationSecretRecord);
    return { cloud: true as const, diaryName: d.name, me, myRole, members: views, invitations };
  }, [db, diaryId, diary, records]);

  const api = useCallback(async () => {
    const me = await self(db);
    return createSharingApi('', undefined, async () => me?.userId ?? '');
  }, [db]);

  const invite = useCallback(
    async (role: 'editor' | 'viewer') => {
      const me = await self(db);
      const d = await diary.getDiary(diaryId);
      const r = await createInvitationLink(await api(), records, {
        diaryId, role, diaryName: d?.name ?? '', inviterName: me?.username ?? '', origin: globalThis.location.origin, now,
      });
      query.retry();
      return r.link;
    },
    [db, diary, diaryId, api, records, now, query],
  );

  const revokeInvitation = useCallback(
    async (id: string) => {
      await (await api()).revokeInvitation(id).catch(() => undefined);
      await records.remove(id);
      query.retry();
    },
    [api, records, query],
  );

  const changeRole = useCallback(async (principalId: string, role: Member['role']) => {
    await (await api()).changeRole(diaryId, principalId, role);
    query.retry();
  }, [api, diaryId, query]);

  const remove = useCallback(async (principalId: string) => {
    await (await api()).removeMember(diaryId, principalId);
    query.retry();
  }, [api, diaryId, query]);

  const leave = useCallback(async () => {
    await leaveDiary(await api(), db, diaryId);
    void sync.syncNow();
  }, [api, db, diaryId, sync]);

  return { query, invite, revokeInvitation, changeRole, remove, leave, refresh: query.retry };
}

/** Darf dieses Gerät Vorlagen des Tagebuchs ändern (A-002: nur Besitzer bzw. local-only)? `null` = noch unbekannt. */
export function useIsOwner(diaryId: string | null): boolean | null {
  const { db } = useAuth();
  const q = useQuery(async () => {
    if (!diaryId) return null;
    const me = await self(db);
    if (!me) return true;
    return ((await loadMembers(db, diaryId)).find((m) => m.principalId === me.userId)?.role ?? 'owner') === 'owner';
  }, [db, diaryId]);
  return q.status === 'ok' ? q.data : null;
}

/** Tagebücher, in die dieses Gerät schreiben darf: local-only alle, mit Konto Rolle Besitzer/Editor (Mitgliederliste aus dem lokalen Cache; unbekannt = Besitzer wie in `useMembers`). */
export function useWritableDiaries() {
  const { db } = useAuth();
  const { diary } = useData();
  return useQuery(async () => {
    const diaries = await diary.listDiaries();
    const me = await self(db);
    if (!me) return diaries;
    const out: typeof diaries = [];
    for (const d of diaries) {
      const role = (await loadMembers(db, d.id)).find((m) => m.principalId === me.userId)?.role ?? 'owner';
      if (role !== 'viewer') out.push(d);
    }
    return out;
  }, [db, diary]);
}

/** „Erfasst von": Benutzername eines Autors in einem geteilten Tagebuch (nur, wenn es mehr als ein Mitglied gibt). */
export function useAuthorName(diaryId: string | undefined, authorId: string | undefined) {
  const { db } = useAuth();
  return useQuery(async () => {
    if (!diaryId || !authorId) return null;
    const members = await loadMembers(db, diaryId);
    if (members.length < 2) return null;
    return members.find((m) => m.principalId === authorId)?.username ?? null;
  }, [db, diaryId, authorId]);
}

/** Einladung annehmen (`/invite#<id>.<secret>`). */
export function useInvitation(id: string | null, secret: string | null) {
  const { db } = useAuth();
  const sync = useSync();
  const details = useQuery(async () => {
    if (!id || !secret) return null;
    return openInvitation(createSharingApi(''), id, secret);
  }, [id, secret]);
  const accept = useCallback(async () => {
    const me = await self(db);
    if (!me || !id || !secret) throw new Error('Kein Konto');
    await acceptInvitationWith(createSharingApi(''), id, secret, me.identityPub);
    void sync.syncNow();
  }, [db, id, secret, sync]);
  const isCloud = useQuery(async () => !!(await self(db)), [db]);
  return { details, accept, isCloud };
}
