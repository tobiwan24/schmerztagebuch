// Erkennen + Entfernen der v2-Daten für Start-Hinweis und Einstellungen (Spec 11) — ohne Assistent-Code (QA-02).
import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useQuery } from '@/data/useQuery';
import { countV2, readV2Snapshot, V2_DB_NAME, type V2Counts } from './v2/source';
import { loadMigrationState, saveMigrationState, type MigrationState } from './state';

export interface V2Status {
  counts: V2Counts | null;
  state: MigrationState | undefined;
}

export function useV2Status() {
  const { db } = useAuth();
  return useQuery<V2Status>(async () => {
    const [snap, state] = await Promise.all([readV2Snapshot().catch(() => null), loadMigrationState(db)]);
    return { counts: snap ? countV2(snap) : null, state };
  }, [db]);
}

/** „v2-Daten von diesem Gerät entfernen" — nur nach erfolgreicher Prüfung (MIG-14). */
export function useRemoveV2() {
  const { db, now } = useAuth();
  return useCallback(async () => {
    const state = await loadMigrationState(db);
    if (!state?.verify.ok || !state.migratedFromV2At) throw new Error('Prüfung nicht erfolgreich');
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(V2_DB_NAME);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error ?? new Error('Löschen fehlgeschlagen'));
      r.onblocked = () => reject(new Error('v2 ist noch in einem anderen Tab geöffnet'));
    });
    await saveMigrationState(db, { ...state, v2RemovedAt: new Date(now()).toISOString() });
  }, [db, now]);
}
