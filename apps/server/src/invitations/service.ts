// Einladungen (Spec 09). Der Server kennt nur Chiffretext, Rolle und nach der Annahme `identityPub` + `mac`;
// das `secret` bleibt im URL-Fragment. Die Echtheit der Annahme prüft der Owner-Client per HMAC (SHR-03, M6).
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { findActiveRole, type MembershipRole } from '../members/service.js';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** QR-Einladung (RDM-032): nur kurz gültig, der Owner-Client widerruft sie zusätzlich beim Schließen. */
export const INVITATION_QR_TTL_MS = 10 * 60 * 1000;

interface InvitationRow {
  id: string;
  diary_id: string;
  role: MembershipRole;
  ciphertext: string;
  expires_at: number;
  accepted_at: number | null;
  accepted_by: string | null;
  identity_pub: string | null;
  mac: string | null;
  revoked_at: number | null;
  confirmed_at: number | null;
}

type Fail = 'not-found' | 'gone' | 'forbidden' | 'conflict';
export type Result<T> = { ok: true; value: T } | { ok: false; error: Fail };
const fail = <T>(error: Fail): Result<T> => ({ ok: false, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

const get = (db: Db, id: string) => db.prepare('SELECT * FROM invitations WHERE id = ?').get(id) as InvitationRow | undefined;
const isOpen = (r: InvitationRow, now: number) => r.revoked_at === null && r.accepted_at === null && now < r.expires_at;

export function createInvitation(db: Db, diaryId: string, actor: string, role: Exclude<MembershipRole, 'owner'>, ciphertext: string, now: number, ttlMs: number = INVITATION_TTL_MS): Result<{ id: string; expiresAt: number }> {
  if (findActiveRole(db, diaryId, actor) !== 'owner') return fail('forbidden');
  const id = randomUUID();
  const expiresAt = now + ttlMs;
  db.prepare('INSERT INTO invitations (id, diary_id, inviter_id, role, ciphertext, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, diaryId, actor, role, ciphertext, expiresAt, now);
  return ok({ id, expiresAt });
}

/** Öffentlicher Abruf (ohne Auth): nur solange die Einladung offen ist. */
export function readInvitation(db: Db, id: string, now: number): Result<{ id: string; diaryId: string; ciphertext: string; expiresAt: number }> {
  const r = get(db, id);
  if (!r) return fail('not-found');
  if (!isOpen(r, now)) return fail('gone');
  return ok({ id: r.id, diaryId: r.diary_id, ciphertext: r.ciphertext, expiresAt: r.expires_at });
}

/** Annahme: einmalig, nicht nach Ablauf oder Widerruf (SHR-08). */
export function acceptInvitation(db: Db, id: string, actor: string, identityPub: string, mac: string, now: number): Result<null> {
  return db.transaction((): Result<null> => {
    const r = get(db, id);
    if (!r) return fail('not-found');
    if (!isOpen(r, now)) return fail('gone');
    if (findActiveRole(db, r.diary_id, actor)) return fail('conflict');
    db.prepare('UPDATE invitations SET accepted_at = ?, accepted_by = ?, identity_pub = ?, mac = ? WHERE id = ?').run(now, actor, identityPub, mac, id);
    return ok(null);
  })();
}

export function revokeInvitation(db: Db, id: string, actor: string, now: number): Result<null> {
  const r = get(db, id);
  if (!r) return fail('not-found');
  if (findActiveRole(db, r.diary_id, actor) !== 'owner') return fail('forbidden');
  if (r.revoked_at === null) db.prepare('UPDATE invitations SET revoked_at = ? WHERE id = ?').run(now, id);
  return ok(null);
}

/** Angenommene, noch nicht bestätigte Einladungen eines Tagebuchs (für den Owner-Client). */
export function listPendingAcceptances(db: Db, diaryId: string, actor: string): Result<{ id: string; role: MembershipRole; acceptedBy: string; identityPub: string; mac: string }[]> {
  if (findActiveRole(db, diaryId, actor) !== 'owner') return fail('forbidden');
  const rows = db
    .prepare('SELECT * FROM invitations WHERE diary_id = ? AND accepted_at IS NOT NULL AND confirmed_at IS NULL AND revoked_at IS NULL ORDER BY accepted_at')
    .all(diaryId) as InvitationRow[];
  return ok(rows.map((r) => ({ id: r.id, role: r.role, acceptedBy: r.accepted_by!, identityPub: r.identity_pub!, mac: r.mac! })));
}

/** Owner bestätigt eine Annahme mit dem für das neue Mitglied verpackten DK → Mitgliedschaft. */
export function confirmMember(db: Db, diaryId: string, actor: string, invitationId: string, wrappedDk: string, now: number): Result<null> {
  return db.transaction((): Result<null> => {
    if (findActiveRole(db, diaryId, actor) !== 'owner') return fail('forbidden');
    const r = get(db, invitationId);
    if (!r || r.diary_id !== diaryId) return fail('not-found');
    if (r.accepted_by === null || r.confirmed_at !== null || r.revoked_at !== null) return fail('conflict');
    const epoch = (db.prepare('SELECT key_epoch FROM memberships WHERE diary_id = ? AND principal_id = ?').get(diaryId, actor) as { key_epoch: number }).key_epoch;
    db.prepare(`
      INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(diary_id, principal_id) DO UPDATE SET role = excluded.role, key_epoch = excluded.key_epoch,
        wrapped_dk = excluded.wrapped_dk, created_at = excluded.created_at, revoked_at = NULL
    `).run(diaryId, r.accepted_by, r.role, epoch, wrappedDk, now);
    db.prepare('UPDATE invitations SET confirmed_at = ? WHERE id = ?').run(now, invitationId);
    return ok(null);
  })();
}
