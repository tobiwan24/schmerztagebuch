// Tagebuch-Umschalter (Spec 10 „Navigation", UI-24, A-049): welches Tagebuch Start, Verlauf, Auswertung und die
// Vorauswahl neuer Einträge zeigen. Pro Gerät in `device` gemerkt. „Alle" gibt es nur in Verlauf und Auswertung.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Diary } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { useData } from './DataContext';
import { useQuery } from './useQuery';

const STORE_ID = 'active-diary';
export const ALL_DIARIES = 'all';

interface ScopeApi {
  diaries: Diary[];
  /** Gemerkte Auswahl (`ALL_DIARIES` oder Tagebuch-ID). */
  stored: string;
  select(id: string): void;
}

const ScopeContext = createContext<ScopeApi | null>(null);

export function DiaryScopeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { db } = useAuth();
  const { diary, writes } = useData();
  const list = useQuery(() => (enabled ? diary.listDiaries() : Promise.resolve([] as Diary[])), [diary, enabled]);
  // Neues/umbenanntes Tagebuch (lokale Änderung) → Liste neu laden
  const { retry } = list;
  useEffect(() => {
    writes.addEventListener('write', retry);
    return () => writes.removeEventListener('write', retry);
  }, [writes, retry]);
  const [stored, setStored] = useState(ALL_DIARIES);
  useEffect(() => {
    let cancelled = false;
    void db.device.get(STORE_ID).then((row) => {
      if (!cancelled && typeof row?.value === 'string') setStored(row.value);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);
  const select = useCallback(
    (id: string) => {
      setStored(id);
      void db.device.put({ id: STORE_ID, value: id });
    },
    [db],
  );
  const api = useMemo<ScopeApi>(() => ({ diaries: list.status === 'ok' ? list.data : [], stored, select }), [list, stored, select]);
  return <ScopeContext.Provider value={api}>{children}</ScopeContext.Provider>;
}

/**
 * Wirksames Tagebuch für eine Ansicht: ID oder `null` (= alle; auch bei nur einem Tagebuch, dann ohne Umschalter).
 * `allowAll = false` (Start, neuer Eintrag): bei „Alle" gilt das erste Tagebuch.
 */
export function useDiaryScope(allowAll: boolean): { diaryId: string | null; diaries: Diary[]; stored: string; select(id: string): void } {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useDiaryScope außerhalb von <DiaryScopeProvider>');
  const { diaries, stored, select } = ctx;
  let diaryId: string | null = null;
  if (diaries.length > 1) {
    if (diaries.some((d) => d.id === stored)) diaryId = stored;
    else diaryId = allowAll ? null : (diaries[0]?.id ?? null);
  }
  return { diaryId, diaries, stored, select };
}
