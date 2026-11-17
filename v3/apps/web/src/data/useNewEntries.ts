// Start-Hinweis „n neue Einträge von X“ (SHR-15): je Tagebuch und anderem Autor eine Zeile.
import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { entrySchema } from '@stb/core';
import { useData } from './DataContext';
import { loadMembers } from './members-cache';
import { groupNewEntries, loadSeen, saveSeen } from './new-entries';
import { useQuery } from './useQuery';

export interface NewEntriesItem {
  diaryId: string;
  authorId: string;
  /** Benutzername aus der gemerkten Mitgliederliste (sonst leer). */
  name: string;
  count: number;
}

export function useNewEntries() {
  const { db, now } = useAuth();
  const { diary, records, stamper } = useData();
  const q = useQuery(async () => {
    const { userId } = await stamper.identity();
    const items: NewEntriesItem[] = [];
    for (const d of await diary.listDiaries()) {
      const seen = await loadSeen(db, d.id);
      if (seen === undefined) {
        await saveSeen(db, d.id, now()); // Ausgangspunkt: Bestand vor dem ersten Besuch ist nicht „neu“
        continue;
      }
      const arrived = (await records.listUpdatedSince(d.id, 'entry', seen)).map((r) => entrySchema.safeParse(r.payload)).flatMap((p) => (p.success ? [p.data] : []));
      const members = await loadMembers(db, d.id);
      for (const g of groupNewEntries(arrived, userId)) items.push({ diaryId: d.id, ...g, name: members.find((m) => m.principalId === g.authorId)?.username ?? '' });
    }
    return items;
  }, [db, diary, records, stamper, now]);

  const markSeen = useCallback(
    async (diaryId: string) => {
      await saveSeen(db, diaryId, now());
      q.retry();
    },
    [db, now, q],
  );
  return { items: q.status === 'ok' ? q.data : [], markSeen };
}
