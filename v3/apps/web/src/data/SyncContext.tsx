// Sync im Hintergrund (Spec 04): nur beim Konto „Mit Konto" und entsperrt (DKs nur in der Sitzung). Auslöser: Start,
// jede lokale Änderung (entprellt), `online`, Rückkehr in den Vordergrund. Status für das UI (SYN-14):
// synchronisiert / ausstehend n / offline / Fehler. Nach übernommenen fremden Änderungen steigt `revision` (Ansichten laden nach).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createSyncEngine, type SyncEngine } from '@/sync/engine';
import { createFetchTransport } from '@/sync/transport';
import { useData } from './DataContext';

export type SyncState = 'disabled' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

export interface SyncApi {
  state: SyncState;
  /** Noch nicht übertragene Änderungen (Outbox). */
  pending: number;
  /** Mindestens ein Lauf ist abgeschlossen (z. B. nach dem Login auf einem neuen Gerät). */
  ready: boolean;
  syncNow(): Promise<void>;
}

const DISABLED: SyncApi = { state: 'disabled', pending: 0, ready: true, syncNow: async () => undefined };
const SyncContext = createContext<SyncApi>(DISABLED);

const WRITE_DEBOUNCE_MS = 300;

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const data = useData();
  const enabled = auth.status === 'unlocked' && auth.accountMode === 'cloud-primary';
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [state, setState] = useState<SyncState>('syncing');
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);
  const { db, session } = auth;
  const { registry, newId, now, stamper, writes, bumpRevision } = data;

  useEffect(() => {
    if (!enabled) {
      setEngine(null);
      return;
    }
    let cancelled = false;
    void stamper.clock().then((hlc) => {
      if (cancelled) return;
      setEngine(
        createSyncEngine({
          db, registry, writeCodec: 'plain', transport: createFetchTransport(''), keys: session.keys, newId, clock: { now }, hlc,
          diaryIds: async () => (await db.sync_state.toArray()).filter((s) => s.mode === 'cloud-primary').map((s) => s.diaryId),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, db, session, registry, newId, now, stamper]);

  const countPending = useCallback(async () => {
    const n = await db.outbox.count();
    setPending(n);
    return n;
  }, [db]);

  const running = useRef<Promise<void> | null>(null);
  const run = useCallback(async () => {
    if (!engine) return;
    setState('syncing');
    const lastChange = () => db.records.orderBy('localUpdatedAt').last().then((r) => r?.localUpdatedAt ?? 0);
    const before = await lastChange();
    try {
      await engine.sync();
      const n = await countPending();
      setState(n > 0 ? 'pending' : 'synced');
    } catch {
      await countPending();
      setState(globalThis.navigator?.onLine === false ? 'offline' : 'error');
    } finally {
      setReady(true);
      // Fremde Änderungen übernommen? (Pull schreibt Records) → Ansichten neu laden.
      const after = await lastChange();
      if (after !== before) bumpRevision();
    }
  }, [engine, db, countPending, bumpRevision]);

  const syncNow = useCallback(() => {
    running.current = run();
    return running.current;
  }, [run]);

  useEffect(() => {
    if (!engine) return;
    void syncNow();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWrite = () => {
      void countPending().then((n) => n > 0 && setState((s) => (s === 'syncing' ? s : 'pending')));
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), WRITE_DEBOUNCE_MS);
    };
    const onOnline = () => void syncNow();
    const onOffline = () => setState('offline');
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    writes.addEventListener('write', onWrite);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      writes.removeEventListener('write', onWrite);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [engine, writes, syncNow, countPending]);

  const api = useMemo<SyncApi>(() => (enabled ? { state, pending, ready, syncNow } : DISABLED), [enabled, state, pending, ready, syncNow]);
  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}

export const useSync = (): SyncApi => useContext(SyncContext);
