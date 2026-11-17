// Rollen und Mitgliedschaften (Spec 09). Rollen werden serverseitig bei jedem Push durchgesetzt.
import type { Db } from '../db.js';

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type MembershipRole = (typeof ROLES)[number];

/**
 * Record-Arten, die eine Rolle pushen darf. `editor`: Einträge (inkl. Anhang-Metadaten), eigene Intake-Schlüssel und
 * Eingangs-Items (Spec 08), keine Vorlagen, Tagebuch-Einstellungen oder gespeicherten Filter (DECISIONS A-002, A-013, A-017). `viewer`: nichts.
 */
const EDITOR_KINDS: ReadonlySet<string> = new Set(['entry', 'attachmentMeta', 'intakeKey', 'intakeInbox']);

/** Zusätzlich für einen Editor mit dem Flag `canEditTemplates` (A-121, SHR-14). */
const TEMPLATE_KINDS: ReadonlySet<string> = new Set(['template', 'templateVersion']);

export function mayPushKind(role: MembershipRole, kind: string, canEditTemplates = false): boolean {
  if (role === 'owner') return true;
  if (role === 'editor') return EDITOR_KINDS.has(kind) || (canEditTemplates && TEMPLATE_KINDS.has(kind));
  return false;
}

export interface ActiveMembership {
  role: MembershipRole;
  canEditTemplates: boolean;
}

export function findActiveMembership(db: Db, diaryId: string, principalId: string): ActiveMembership | undefined {
  const row = db
    .prepare('SELECT role, can_edit_templates FROM memberships WHERE diary_id = ? AND principal_id = ? AND revoked_at IS NULL')
    .get(diaryId, principalId) as { role: MembershipRole; can_edit_templates: number } | undefined;
  return row ? { role: row.role, canEditTemplates: row.can_edit_templates === 1 } : undefined;
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

export type MemberChangeResult = 'ok' | 'forbidden' | 'not-found' | 'last-owner' | 'not-editor';

/**
 * Rolle und/oder Flag `canEditTemplates` ändern: nur Owner; der letzte Owner kann nicht herabgestuft werden. Das Flag gilt nur für
 * Editoren: bei jedem Rollenwechsel wird es zurückgesetzt (außer es wird zugleich gesetzt), für andere Rollen ist es nicht setzbar.
 */
export function changeRole(db: Db, diaryId: string, actor: string, target: string, change: { role?: MembershipRole; canEditTemplates?: boolean }): MemberChangeResult {
  return db.transaction((): MemberChangeResult => {
    if (findActiveRole(db, diaryId, actor) !== 'owner') return 'forbidden';
    const current = findActiveRole(db, diaryId, target);
    if (!current) return 'not-found';
    const role = change.role ?? current;
    if (current === 'owner' && role !== 'owner' && activeOwnerCount(db, diaryId) <= 1) return 'last-owner';
    if (change.canEditTemplates === true && role !== 'editor') return 'not-editor';
    const flag = role === 'editor' ? (change.canEditTemplates ?? (role === current ? undefined : false)) : false;
    db.prepare('UPDATE memberships SET role = ? WHERE diary_id = ? AND principal_id = ?').run(role, diaryId, target);
    if (flag !== undefined) db.prepare('UPDATE memberships SET can_edit_templates = ? WHERE diary_id = ? AND principal_id = ?').run(flag ? 1 : 0, diaryId, target);
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
