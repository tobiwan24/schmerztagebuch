// „n neue Einträge von X“ (Spec 09, SHR-15): Einträge anderer Mitglieder, die seit dem letzten Besuch lokal angekommen sind.
// Rein lokal (kein Push, kein Server): Grundlage ist der Zeitpunkt, zu dem der Record auf diesem Gerät ankam (`localUpdatedAt`).
// „Letzter Besuch“ ist der Zeitpunkt, an dem der Hinweis zuletzt bestätigt wurde (Tippen oder Ausblenden); beim ersten Mal
// wird nur der Ausgangspunkt gesetzt (kein Hinweis auf Einträge, die schon vorher da waren).
import type { StbDb } from './db';

const key = (diaryId: string) => `seen:${diaryId}`;

export async function loadSeen(db: StbDb, diaryId: string): Promise<number | undefined> {
  return ((await db.keys.get(key(diaryId)))?.value as { at?: number } | undefined)?.at;
}

export async function saveSeen(db: StbDb, diaryId: string, at: number): Promise<void> {
  await db.keys.put({ id: key(diaryId), value: { diaryId, at } });
}

export interface NewFromAuthor {
  authorId: string;
  count: number;
}

/** Zählt Einträge anderer Autoren je Autor (absteigend nach Anzahl, dann Autor-ID). Eigene Einträge zählen nie. */
export function groupNewEntries(rows: readonly { authorId: string }[], me: string): NewFromAuthor[] {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.authorId !== me) counts.set(r.authorId, (counts.get(r.authorId) ?? 0) + 1);
  return [...counts].map(([authorId, count]) => ({ authorId, count })).sort((a, b) => b.count - a.count || (a.authorId < b.authorId ? -1 : 1));
}
