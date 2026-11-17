// Vormerkung „Rotation nötig" (M22): wird VOR dem Entfernen eines Mitglieds bzw. Sperren eines Geräts geschrieben und erst nach
// dem erfolgreichen Abschluss gelöscht — so setzt eine nach einem Absturz oder App-Neustart unterbrochene Rotation fort.
import type { StbDb } from '../data/db.js';

const PREFIX = 'rotation:';
export type RotationReason = 'member-removed' | 'device-revoked' | 'resume';

export async function markRotation(db: StbDb, diaryId: string, reason: RotationReason, at: number): Promise<void> {
  const existing = await db.keys.get(`${PREFIX}${diaryId}`);
  if (existing) return; // eine offene Vormerkung bleibt unverändert
  await db.keys.put({ id: `${PREFIX}${diaryId}`, value: { diaryId, reason, at } });
}

export async function clearRotationMark(db: StbDb, diaryId: string): Promise<void> {
  await db.keys.delete(`${PREFIX}${diaryId}`);
}

export async function markedRotations(db: StbDb): Promise<string[]> {
  return (await db.keys.toArray()).filter((r) => r.id.startsWith(PREFIX)).map((r) => (r.value as { diaryId: string }).diaryId);
}
