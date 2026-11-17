// Sync im Hintergrund (Spec 04): nur beim Konto „Mit Konto" und entsperrt (DKs nur in der Sitzung). Auslöser: Start,
// jede lokale Änderung (entprellt), `online`, Rückkehr in den Vordergrund. Status für das UI (SYN-14):
// synchronisiert / ausstehend n / offline / Fehler. Nach übernommenen fremden Änderungen steigt `revision` (Ansichten laden nach).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createSyncEngine, type SyncEngine } from '@/sync/engine';
import { SyncModeError, switchToLocalOnly } from '@/sync/mode';
import { createFetchTransport } from '@/sync/transport';
import { quickEntrySelection, type HlcClock, type TemplateState } from '@stb/core';
import { createIntakeApi } from '@/intake/api';
import { pickupIntake } from '@/intake/pickup';
import { createFetchAccountApi } from '@/auth/account-api';
import { isCloudAccount, syncMemberships } from '@/auth/cloud-account';
import { loadAccount } from '@/auth/local-account';
import { createSharingApi } from '@/sharing/api';
import { createRotationApi } from '@/sharing/rotation-api';
import type { RotationProgress } from '@/sharing/rotate';
import { markRotation, markedRotations, type RotationReason } from '@/sharing/rotation-marker';
import { confirmAcceptances } from '@/sharing/invitations';
import { invitationSecretFor } from '@/sharing/flow';
import { isSyncDetached } from './sync-detached';
import { saveMembers } from './members-cache';
import { useData } from './DataContext';

export type SyncState = 'disabled' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

/** Fortschritt/Ergebnis einer DK-Rotation (Spec 09, SHR-13). */
export interface RotationStatus {
  diaryId: string;
  status: 'running' | 'done' | 'failed';
  phase: RotationProgress['phase'];
  done: number;
  total: number;
}

export interface SyncApi {
  state: SyncState;
  /** Noch nicht übertragene Änderungen (Outbox). */
  pending: number;
  /** Mindestens ein Lauf ist abgeschlossen (z. B. nach dem Login auf einem neuen Gerät). */
  ready: boolean;
  syncNow(): Promise<void>;
  /**
   * Zurück auf „nur dieses Gerät“ (UI-20, SYN-12): vollständig pullen, bei nicht leerer Outbox blockiert; danach sind alle
   * Tagebücher `local-only` und es gehen keine Requests mehr an den Server.
   */
  detach(): Promise<{ ok: true } | { ok: false; reason: 'outbox-not-empty' | 'server-unreachable'; pending: number }>;
  /** Anhang-Inhalt vom Server laden (nur Cloud-Tagebücher); `undefined`, wenn nicht verfügbar. */
  fetchBlob(diaryId: string, id: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  /** Laufende oder zuletzt beendete Schlüsselrotation (nur Besitzer). */
  rotation: RotationStatus | null;
  /**
   * Schlüssel eines Tagebuchs rotieren (Mitglied entfernt): Vormerkung, Neuverschlüsselung im Hintergrund mit Fortschritt,
   * Abschluss. Eine unterbrochene Rotation setzt beim nächsten Sync fort.
   */
  rotateDiary(diaryId: string, reason: RotationReason): Promise<void>;
  /** Alle eigenen Tagebücher rotieren (Gerät gesperrt); `between` läuft nach der Vormerkung (z. B. das Sperren selbst). */
  rotateOwned(reason: RotationReason, between?: () => Promise<void>): Promise<void>;
}

const DISABLED: SyncApi = { state: 'disabled', pending: 0, ready: true, syncNow: async () => undefined, detach: async () => ({ ok: false, reason: 'server-unreachable', pending: 0 }), fetchBlob: async () => undefined, rotation: null, rotateDiary: async () => undefined, rotateOwned: async (_r, between) => between?.() };
const SyncContext = createContext<SyncApi>(DISABLED);

const WRITE_DEBOUNCE_MS = 300;

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const data = useData();
  const enabled = auth.status === 'unlocked' && auth.syncAttached;
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [state, setState] = useState<SyncState>('syncing');
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);
  const { db, session } = auth;
  const { registry, newId, now, stamper, writes, bumpRevision, records, diary } = data;
  const hlcRef = useRef<HlcClock | null>(null);
  const [rotation, setRotation] = useState<RotationStatus | null>(null);
  const rotating = useRef(false);

  /** Schlüssel eines Tagebuchs vom Server neu laden (nach Rotation oder `409 stale-epoch`). */
  const refreshKey = useCallback(
    async (diaryId: string) => {
      const account: unknown = await loadAccount(db);
      if (!isCloudAccount(account) || !session.isUnlocked()) return;
      const { refreshDiaryKey } = await import('@/auth/refresh-key'); // erst bei Bedarf laden (Bundle-Budget)
      await refreshDiaryKey(db, createFetchAccountApi(''), createRotationApi(''), account, session.umk(), diaryId, (id, key, epoch, previous) => session.setDiaryKey(id, key, epoch, previous));
    },
    [db, session],
  );

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
          db, registry, writeCodec: 'plain', transport: createFetchTransport(''), keys: { ...session.keys, refresh: refreshKey }, newId, clock: { now }, hlc,
          diaryIds: async () => (await db.sync_state.toArray()).filter((s) => s.mode === 'cloud-primary').map((s) => s.diaryId),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, db, session, registry, newId, now, stamper, refreshKey]);

  const countPending = useCallback(async () => {
    const n = await db.outbox.count();
    setPending(n);
    return n;
  }, [db]);

  /** Geteilte Tagebücher übernehmen (neue DK-Wraps vom Server, Spec 09) — vor dem Sync, damit der Pull sie gleich holt. */
  const membershipsBefore = useCallback(async () => {
    const account: unknown = await loadAccount(db);
    if (!isCloudAccount(account) || !session.isUnlocked()) return;
    await syncMemberships(db, createFetchAccountApi(''), account, session.umk(), (id, key, epoch, previous) => session.setDiaryKey(id, key, epoch, previous), createRotationApi('')).catch(() => []);
  }, [db, session]);

  /** Eine Rotation ausführen (Vormerkung bleibt bis zum Abschluss). Nie parallel. */
  const runRotation = useCallback(
    async (diaryId: string) => {
      if (rotating.current || !session.isUnlocked()) return;
      rotating.current = true;
      const show = (p: Partial<RotationStatus>) => setRotation((cur) => ({ diaryId, status: 'running', phase: 'start', done: 0, total: 0, ...(cur?.diaryId === diaryId ? cur : {}), ...p }));
      show({ status: 'running', phase: 'start', done: 0, total: 0 });
      try {
        const { executeRotation } = await import('@/sharing/rotation-runner'); // erst bei einer Rotation laden (Bundle-Budget)
        await executeRotation({ db, session, refreshKey, report: (u) => {
          if (u.status === 'gone') setRotation(null);
          else if (u.status === 'running') show(u.progress ? { status: 'running', phase: u.progress.phase, done: u.progress.done, total: u.progress.total } : { status: 'running' });
          else show({ status: u.status, ...(u.status === 'done' ? { phase: 'complete' as const } : {}) });
        } }, diaryId);
      } catch {
        show({ status: 'failed' });
      } finally {
        rotating.current = false;
      }
    },
    [db, session, refreshKey],
  );

  /** Unterbrochene Rotationen fortsetzen (Vormerkung vorhanden), vor dem Sync, damit anschließend mit dem neuen Schlüssel gepusht wird. */
  const resumeRotations = useCallback(async () => {
    for (const id of await markedRotations(db)) await runRotation(id);
  }, [db, runRotation]);

  /** Nach dem Sync: angenommene Einladungen prüfen und bestätigen (Owner), Mitgliederlisten für „Erfasst von" merken. */
  const sharingAfter = useCallback(async () => {
    const account: unknown = await loadAccount(db);
    if (!isCloudAccount(account)) return;
    const api = createSharingApi('');
    for (const m of await createFetchAccountApi('').listDiaries().catch(() => [])) {
      if (m.role === 'owner') {
        const { key, keyEpoch } = await session.keys.get(m.diaryId).catch(() => ({ key: null, keyEpoch: 0 }));
        if (key) {
          const outcomes = await confirmAcceptances(api, m.diaryId, key, { diaryId: m.diaryId, keyEpoch }, (id) => invitationSecretFor(records, id)).catch(() => []);
          // bestätigte Einladungen sind erledigt — Geheimnis nicht länger aufbewahren
          for (const o of outcomes) if (o.status === 'confirmed') await records.remove(o.invitationId).catch(() => undefined);
        }
      }
      const members = await api.listMembers(m.diaryId).catch(() => null);
      if (members) await saveMembers(db, m.diaryId, members);
    }
  }, [db, session, records]);

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
      await membershipsBefore();
      await resumeRotations();
      await engine.sync();
      // Währenddessen auf „nur dieses Gerät“ zurückgestellt (UI-20)? Dann keine weiteren Server-Anfragen.
      if (!(await isSyncDetached(db))) {
        await sharingAfter();
        await pickupAll();
      }
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
  }, [engine, db, countPending, bumpRevision, pickupAll, membershipsBefore, sharingAfter, resumeRotations]);

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

  const detach = useCallback<SyncApi['detach']>(async () => {
    if (!engine) return { ok: false, reason: 'server-unreachable', pending: 0 };
    try {
      await running.current?.catch(() => undefined);
      for (const s of (await db.sync_state.toArray()).filter((x) => x.mode === 'cloud-primary')) {
        await switchToLocalOnly(db, s.diaryId, { pull: () => engine.pullDiary(s.diaryId).then(() => undefined) });
      }
    } catch (e) {
      if (e instanceof SyncModeError) return { ok: false, reason: e.code, pending: e.pending };
      throw e;
    }
    await auth.setSyncAttached(false);
    return { ok: true };
  }, [engine, db, auth]);

  const fetchBlob = useCallback(
    async (diaryId: string, id: string) => {
      if (!engine) return undefined;
      const mode = await db.sync_state.get(diaryId);
      return mode?.mode === 'cloud-primary' ? engine.downloadBlob(diaryId, id) : undefined;
    },
    [engine, db],
  );

  const rotateDiaryNow = useCallback<SyncApi['rotateDiary']>(
    async (diaryId, reason) => {
      await markRotation(db, diaryId, reason, now());
      await running.current?.catch(() => undefined);
      await runRotation(diaryId);
      void syncNow();
    },
    [db, now, runRotation, syncNow],
  );

  const rotateOwned = useCallback<SyncApi['rotateOwned']>(
    async (reason, between) => {
      const owned = (await createFetchAccountApi('').listDiaries()).filter((m) => m.role === 'owner').map((m) => m.diaryId);
      for (const id of owned) await markRotation(db, id, reason, now());
      await between?.();
      await running.current?.catch(() => undefined);
      for (const id of owned) await runRotation(id);
      void syncNow();
    },
    [db, now, runRotation, syncNow],
  );

  const api = useMemo<SyncApi>(
    () => (enabled ? { state, pending, ready, syncNow, detach, fetchBlob, rotation, rotateDiary: rotateDiaryNow, rotateOwned } : DISABLED),
    [enabled, state, pending, ready, syncNow, detach, fetchBlob, rotation, rotateDiaryNow, rotateOwned],
  );
  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}

export const useSync = (): SyncApi => useContext(SyncContext);
