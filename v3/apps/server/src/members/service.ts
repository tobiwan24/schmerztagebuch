// Rollen und Mitgliedschaften (Spec 09). Rollen werden serverseitig bei jedem Push durchgesetzt.
import type { Db } from '../db.js';

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type MembershipRole = (typeof ROLES)[number];

/**
 * Record-Arten, die eine Rolle pushen darf. `editor`: Einträge (inkl. Anhang-Metadaten), keine Vorlagen,
 * Tagebuch-Einstellungen, Intake oder gespeicherten Filter (DECISIONS A-002, A-013). `viewer`: nichts.
 */
const EDITOR_KINDS: ReadonlySet<string> = new Set(['entry', 'attachmentMeta']);

export function mayPushKind(role: MembershipRole, kind: string): boolean {
  if (role === 'owner') return true;
  if (role === 'editor') return EDITOR_KINDS.has(kind);
  return false;
}

export function findActiveRole(db: Db, diaryId: string, principalId: string): MembershipRole | undefined {
  const row = db
    .prepare('SELECT role FROM memberships WHERE diary_id = ? AND principal_id = ? AND revoked_at IS NULL')
    .get(diaryId, principalId) as { role: MembershipRole } | undefined;
  return row?.role;
}

function activeOwnerCount(db: Db, diaryId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE diary_id = ? AND role = 'owner' AND revoked_at IS NULL").get(diaryId) as { n: number }).n;
}

export type MemberChangeResult = 'ok' | 'forbidden' | 'not-found' | 'last-owner';

/** Rolle ändern: nur Owner; der letzte Owner kann nicht herabgestuft werden. */
export function changeRole(db: Db, diaryId: string, actor: string, target: string, role: MembershipRole): MemberChangeResult {
  return db.transaction((): MemberChangeResult => {
    if (findActiveRole(db, diaryId, actor) !== 'owner') return 'forbidden';
    const current = findActiveRole(db, diaryId, target);
    if (!current) return 'not-found';
    if (current === 'owner' && role !== 'owner' && activeOwnerCount(db, diaryId) <= 1) return 'last-owner';
    db.prepare('UPDATE memberships SET role = ? WHERE diary_id = ? AND principal_id = ?').run(role, diaryId, target);
    return 'ok';
  })();
}

/** Entfernen (Owner) bzw. Austreten (selbst). Der letzte Owner kann weder austreten noch entfernt werden. */
export function revokeMember(db: Db, diaryId: string, actor: string, target: string, now: number): MemberChangeResult {
  return db.transaction((): MemberChangeResult => {
    const actorRole = findActiveRole(db, diaryId, actor);
    if (!actorRole) return 'forbidden';
    if (actor !== target && actorRole !== 'owner') return 'forbidden';
    const current = findActiveRole(db, diaryId, target);
    if (!current) return 'not-found';
    if (current === 'owner' && activeOwnerCount(db, diaryId) <= 1) return 'last-owner';
    db.prepare('UPDATE memberships SET revoked_at = ? WHERE diary_id = ? AND principal_id = ?').run(now, diaryId, target);
    return 'ok';
  })();
}
