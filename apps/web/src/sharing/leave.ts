// Austreten aus einem geteilten Tagebuch (Spec 09): Mitglied entfernt sich selbst; lokale Daten dieses Tagebuchs werden
// auf dem Gerät gelöscht (SHR-11). Erst nach bestätigtem Austritt beim Server, damit nichts verloren geht, falls der
// Server nicht erreichbar ist.
import type { StbDb } from '../data/db.js';

export interface MembershipApi {
  leave(diaryId: string): Promise<void>;
}

/** Entfernt alle lokalen Spuren eines Tagebuchs: Records (inkl. ConflictLog), Outbox, Sync-Stand, Schlüssel. */
export async function purgeDiaryLocally(db: StbDb, diaryId: string): Promise<void> {
  await db.transaction('rw', [db.records, db.outbox, db.sync_state, db.keys], async () => {
    await db.records.where('[diaryId+kind]').between([diaryId, ''], [diaryId, '￿']).delete();
    const ops = (await db.outbox.toArray()).filter((o) => o.diaryId === diaryId);
    await db.outbox.bulkDelete(ops.map((o) => o.seq!));
    await db.sync_state.delete(diaryId);
    const keys = (await db.keys.toArray()).filter((k) => (k.value as { diaryId?: unknown } | null)?.diaryId === diaryId);
    await db.keys.bulkDelete(keys.map((k) => k.id));
  });
}

export async function leaveDiary(api: MembershipApi, db: StbDb, diaryId: string): Promise<void> {
  await api.leave(diaryId);
  await purgeDiaryLocally(db, diaryId);
}
