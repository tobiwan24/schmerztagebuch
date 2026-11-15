// Sync im Hintergrund (Spec 04): nur beim Konto „Mit Konto" und entsperrt (DKs nur in der Sitzung). Auslöser: Start,
// jede lokale Änderung (entprellt), `online`, Rückkehr in den Vordergrund. Status für das UI (SYN-14):
// synchronisiert / ausstehend n / offline / Fehler. Nach übernommenen fremden Änderungen steigt `revision` (Ansichten laden nach).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createSyncEngine, type SyncEngine } from '@/sync/engine';
import { createFetchTransport } from '@/sync/transport';
import { quickEntrySelection, type HlcClock, type TemplateState } from '@stb/core';
import { createIntakeApi } from '@/intake/api';
import { pickupIntake } from '@/intake/pickup';
import { useData } from './DataContext';

export type SyncState = 'disabled' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

export interface SyncApi {
  state: SyncState;
  /** Noch nicht übertragene Änderungen (Outbox). */
  pending: number;
  /** Mindestens ein Lauf ist abgeschlossen (z. B. nach dem Login auf einem neuen Gerät). */
  ready: boolean;
  syncNow(): Promise<void>;
  /** Anhang-Inhalt vom Server laden (nur Cloud-Tagebücher); `undefined`, wenn nicht verfügbar. */
  fetchBlob(diaryId: string, id: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
}

const DISABLED: SyncApi = { state: 'disabled', pending: 0, ready: true, syncNow: async () => undefined, fetchBlob: async () => undefined };
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
  const { registry, newId, now, stamper, writes, bumpRevision, records, diary } = data;
  const hlcRef = useRef<HlcClock | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEngine(null);
      return;
    }
    let cancelled = false;
    void stamper.clock().then((hlc) => {
      if (cancelled) return;
      hlcRef.current = hlc;
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

  /** Kurzbefehl-Items abholen (Spec 08, Schritt 4) — für Cloud-Tagebücher mit eingerichtetem Intake. */
  const pickupAll = useCallback(async () => {
    const hlc = hlcRef.current;
    if (!hlc) return;
    const { userId } = await stamper.identity();
    for (const s of await db.sync_state.toArray()) {
      if (s.mode !== 'cloud-primary' || !(await records.list(s.diaryId, 'intakeKey')).length) continue;
      const d = await diary.getDiary(s.diaryId);
      if (!d) continue;
      const states = (await Promise.all((await diary.listTemplates(d.id)).map((t) => diary.getTemplate(t.id)))).filter((x): x is TemplateState => !!x);
      const quick = quickEntrySelection(d, states);
      const r = await pickupIntake({
        api: createIntakeApi(''), records, diary, diaryId: d.id, authorId: userId, timezone: d.settings.timezone, newId, now, nextHlc: () => hlc.tick(),
        ...(quick ? { defaultTemplateId: quick.state.template.id } : {}),
      }).catch(() => null);
      if (r && (r.entries.length || r.inbox.length)) await engine?.sync().catch(() => undefined);
    }
  }, [db, records, diary, stamper, newId, now, engine]);

  const running = useRef<Promise<void> | null>(null);
  const run = useCallback(async () => {
    if (!engine) return;
    setState('syncing');
    const lastChange = () => db.records.orderBy('localUpdatedAt').last().then((r) => r?.localUpdatedAt ?? 0);
    const before = await lastChange();
    try {
      await engine.sync();
      await pickupAll();
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
  }, [engine, db, countPending, bumpRevision, pickupAll]);

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

  const fetchBlob = useCallback(
    async (diaryId: string, id: string) => {
      if (!engine) return undefined;
      const mode = await db.sync_state.get(diaryId);
      return mode?.mode === 'cloud-primary' ? engine.downloadBlob(diaryId, id) : undefined;
    },
    [engine, db],
  );

  const api = useMemo<SyncApi>(() => (enabled ? { state, pending, ready, syncNow, fetchBlob } : DISABLED), [enabled, state, pending, ready, syncNow, fetchBlob]);
  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}

export const useSync = (): SyncApi => useContext(SyncContext);
