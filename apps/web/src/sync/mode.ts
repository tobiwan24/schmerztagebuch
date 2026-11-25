// Sync-Modi pro Tagebuch (Spec 04 „Modi"): `local-only` ↔ `cloud-primary`.
import type { StbDb, SyncStateRow } from '../data/db.js';

export type SyncMode = SyncStateRow['mode'];

export class SyncModeError extends Error {
  constructor(
    readonly code: 'outbox-not-empty' | 'server-unreachable',
    message: string,
    readonly pending = 0,
  ) {
    super(message);
    this.name = 'SyncModeError';
  }
}

/** Ohne Eintrag gilt `local-only` (Standard bis zur Kontoanmeldung). */
export async function getSyncMode(db: StbDb, diaryId: string): Promise<SyncMode> {
  return (await db.sync_state.get(diaryId))?.mode ?? 'local-only';
}

/**
 * `cloud-primary → local-only`: vollständiger Pull, Prüfung auf leere Outbox, dann entkoppeln. Server-Daten bleiben,
 * bis der Nutzer sie explizit löscht. Nicht leere Outbox → blockiert (SYN-12).
 */
export async function switchToLocalOnly(db: StbDb, diaryId: string, deps: { pull: () => Promise<void> }): Promise<void> {
  try {
    await deps.pull();
  } catch (e) {
    throw new SyncModeError('server-unreachable', `Vor dem Wechsel muss vollständig synchronisiert werden: ${String(e)}`);
  }
  await db.transaction('rw', db.outbox, db.sync_state, async () => {
    const pending = (await db.outbox.toArray()).filter((o) => o.diaryId === diaryId).length;
    if (pending > 0) {
      throw new SyncModeError('outbox-not-empty', `${pending} Änderung(en) sind noch nicht synchronisiert`, pending);
    }
    const state = await db.sync_state.get(diaryId);
    await db.sync_state.put({ diaryId, cursor: state?.cursor ?? 0, mode: 'local-only' });
  });
}

/** `local-only → cloud-primary`: alle lokalen Records des Tagebuchs in die Outbox (Erst-Push), Modus setzen. */
export async function switchToCloudPrimary(db: StbDb, diaryId: string, deps: { now: () => number }): Promise<void> {
  await db.transaction('rw', db.records, db.outbox, db.sync_state, async () => {
    const records = await db.records.where('diaryId').equals(diaryId).toArray();
    const queued = new Set((await db.outbox.toArray()).map((o) => o.recordId));
    for (const r of records) {
      if (r.kind === 'conflictLog' || queued.has(r.id)) continue;
      await db.outbox.add({ recordId: r.id, diaryId, kind: r.kind, op: r.deleted ? 'delete' : 'upsert', baseRev: r.rev, createdAt: deps.now(), attempts: 0 });
    }
    const state = await db.sync_state.get(diaryId);
    await db.sync_state.put({ diaryId, cursor: state?.cursor ?? 0, mode: 'cloud-primary' });
  });
}
