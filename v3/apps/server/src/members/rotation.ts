// DK-Rotation auf dem Server (Spec 03/09 „Erweiterungen v3.x", M22.2, CRY-22, A-119). Der Server verteilt nur Wraps und achtet auf
// die Epoche; er sieht keinen Schlüssel. Ablauf:
//   1. Owner-Client: `POST /diaries/:id/rotate` {fromEpoch, wraps[], prevDkWrap} — atomar: neue Wraps für genau die aktiven Mitglieder,
//      Epoche + 1, Zustand „Rotation läuft“. Ab jetzt wird nur noch mit der neuen Epoche geschrieben (Push/Blob → 409 `stale-epoch`).
//   2. Der Owner-Client stellt alle Records und Blobs auf die neue Epoche um (fortsetzbar; Zustand allein aus den Daten abgeleitet).
//   3. `POST /diaries/:id/rotate/complete` prüft, dass nichts mehr in einer alten Epoche liegt, und beendet die Rotation.
// Lesen bleibt in beiden Epochen möglich (Pull ist epochenneutral); `prevDkWrap` (alter DK unter dem neuen) liegt bis zum Abschluss bereit.
import type { Db } from '../db.js';
import { findActiveRole } from './service.js';

export interface RotationState {
  keyEpoch: number;
  rotating: boolean;
  fromEpoch: number | null;
  prevDkWrap: string | null;
  pendingRecords: number;
  pendingBlobs: number;
}

interface DiaryRow {
  key_epoch: number;
  rotation_from: number | null;
  prev_dk_wrap: string | null;
}

export function getDiaryEpoch(db: Db, diaryId: string): { keyEpoch: number; rotationFrom: number | null } | undefined {
  const row = db.prepare('SELECT key_epoch, rotation_from FROM diaries WHERE id = ?').get(diaryId) as DiaryRow | undefined;
  return row ? { keyEpoch: row.key_epoch, rotationFrom: row.rotation_from } : undefined;
}

function count(db: Db, table: 'records' | 'blobs', diaryId: string, epoch: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE diary_id = ? AND key_epoch < ?`).get(diaryId, epoch) as { n: number }).n;
}

export function rotationState(db: Db, diaryId: string): RotationState | undefined {
  const d = db.prepare('SELECT key_epoch, rotation_from, prev_dk_wrap FROM diaries WHERE id = ?').get(diaryId) as DiaryRow | undefined;
  if (!d) return undefined;
  const rotating = d.rotation_from !== null;
  return {
    keyEpoch: d.key_epoch,
    rotating,
    fromEpoch: d.rotation_from,
    prevDkWrap: rotating ? d.prev_dk_wrap : null,
    pendingRecords: rotating ? count(db, 'records', diaryId, d.key_epoch) : 0,
    pendingBlobs: rotating ? count(db, 'blobs', diaryId, d.key_epoch) : 0,
  };
}

export interface RotateInput {
  fromEpoch: number;
  wraps: { principalId: string; wrappedDk: string }[];
  prevDkWrap: string;
}

export type RotateResult =
  | { status: 'ok'; keyEpoch: number }
  | { status: 'forbidden' | 'not-found' | 'rotation-running' | 'wraps-mismatch' }
  | { status: 'epoch-mismatch'; keyEpoch: number };

export function startRotation(db: Db, diaryId: string, actor: string, input: RotateInput): RotateResult {
  return db.transaction((): RotateResult => {
    if (findActiveRole(db, diaryId, actor) !== 'owner') return { status: 'forbidden' };
    const d = db.prepare('SELECT key_epoch, rotation_from FROM diaries WHERE id = ?').get(diaryId) as DiaryRow | undefined;
    if (!d) return { status: 'not-found' };
    if (d.rotation_from !== null) return { status: 'rotation-running' };
    if (input.fromEpoch !== d.key_epoch) return { status: 'epoch-mismatch', keyEpoch: d.key_epoch };
    // Wraps genau für die aktiven Mitglieder: ein entferntes Mitglied bekommt keinen, ein aktives darf nicht fehlen
    const active = (db.prepare('SELECT principal_id FROM memberships WHERE diary_id = ? AND revoked_at IS NULL').all(diaryId) as { principal_id: string }[]).map((r) => r.principal_id);
    const given = input.wraps.map((w) => w.principalId);
    if (new Set(given).size !== given.length || given.length !== active.length || !active.every((p) => given.includes(p))) return { status: 'wraps-mismatch' };
    const next = d.key_epoch + 1;
    const set = db.prepare('UPDATE memberships SET key_epoch = ?, wrapped_dk = ? WHERE diary_id = ? AND principal_id = ? AND revoked_at IS NULL');
    for (const w of input.wraps) set.run(next, w.wrappedDk, diaryId, w.principalId);
    db.prepare('UPDATE diaries SET key_epoch = ?, rotation_from = ?, prev_dk_wrap = ? WHERE id = ?').run(next, d.key_epoch, input.prevDkWrap, diaryId);
    return { status: 'ok', keyEpoch: next };
  })();
}

export type CompleteResult =
  | { status: 'ok'; keyEpoch: number; rotating: false }
  | { status: 'forbidden' | 'not-found' }
  | { status: 'incomplete'; pendingRecords: number; pendingBlobs: number };

/** Beendet die Rotation, sobald kein Record und kein Blob mehr in einer alten Epoche liegt. Ohne laufende Rotation ein No-op (idempotent). */
export function completeRotation(db: Db, diaryId: string, actor: string): CompleteResult {
  return db.transaction((): CompleteResult => {
    if (findActiveRole(db, diaryId, actor) !== 'owner') return { status: 'forbidden' };
    const s = rotationState(db, diaryId);
    if (!s) return { status: 'not-found' };
    if (!s.rotating) return { status: 'ok', keyEpoch: s.keyEpoch, rotating: false };
    if (s.pendingRecords > 0 || s.pendingBlobs > 0) return { status: 'incomplete', pendingRecords: s.pendingRecords, pendingBlobs: s.pendingBlobs };
    db.prepare('UPDATE diaries SET rotation_from = NULL, prev_dk_wrap = NULL WHERE id = ?').run(diaryId);
    return { status: 'ok', keyEpoch: s.keyEpoch, rotating: false };
  })();
}
