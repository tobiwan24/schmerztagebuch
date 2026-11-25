// Analyse im Web Worker (Spec 06 „Arbeitsset"): nach dem Entsperren Worker starten und das Arbeitsset aus den
// Repositories laden; bei lokalen Änderungen (`writes`) und übernommenen fremden Änderungen (`revision`) neu laden.
// `version` steigt nach jedem Laden — Ansichten nehmen es in ihre Abfrage-Abhängigkeiten auf.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createAnalysisClient, type AnalysisClient } from '@/workers/analysis-service';
import { loadSearchSnapshot, saveSearchSnapshot } from './search-index-store';
import { useData } from './DataContext';

export interface AnalysisApi {
  client: AnalysisClient | null;
  /** Steigt nach jedem (Neu-)Laden des Arbeitssets. */
  version: number;
}

const AnalysisContext = createContext<AnalysisApi>({ client: null, version: 0 });

const RELOAD_DEBOUNCE_MS = 250;
/** Ruhezeit nach dem Laden, bevor der Suchindex gesichert wird (M23): nicht bei jedem Speichern. */
const PERSIST_INDEX_MS = 5000;

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const { status, db, session, localEncryption } = useAuth();
  const { diary, attachments, writes, revision } = useData();
  const [client, setClient] = useState<AnalysisClient | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(0);
  /** Clients, die den persistierten Suchindex schon bekommen haben (nur der erste Ladevorgang braucht ihn). */
  const seeded = useRef(new WeakSet<AnalysisClient>());

  // Worker nur im entsperrten Zustand (gesperrt: keine Ansichten mit Daten).
  useEffect(() => {
    if (status !== 'unlocked' || typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    const c = createAnalysisClient(worker as unknown as Parameters<typeof createAnalysisClient>[0]);
    setClient(c);
    return () => {
      worker.terminate();
      setClient(null);
    };
  }, [status]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWrite = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setDirty((d) => d + 1), RELOAD_DEBOUNCE_MS);
    };
    writes.addEventListener('write', onWrite);
    return () => {
      clearTimeout(timer);
      writes.removeEventListener('write', onWrite);
    };
  }, [writes]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void (async () => {
      const [entries, templates, versions, diaries, metas] = await Promise.all([
        diary.listAllEntries(), diary.listAllTemplates(), diary.listAllTemplateVersions(), diary.listDiaries(), attachments.listAll(),
      ]);
      // Persistierter Suchindex (nur mit lokaler Verschlüsselung): beim ersten Laden mitgeben, danach nur Abgleich im Worker.
      let snapshot: unknown;
      if (localEncryption && !seeded.current.has(client)) {
        seeded.current.add(client);
        snapshot = await loadSearchSnapshot(db, session.umk()).catch(() => undefined);
      }
      await client.load({ entries, templates, versions, diaries, attachments: metas.map((m) => ({ entryId: m.entryId, kind: m.kind })) }, snapshot);
      if (!cancelled) setVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, diary, attachments, revision, dirty, localEncryption, db, session]);

  // Index sichern, sobald eine Weile nichts mehr nachgeladen wurde (inkrementell: der Worker liefert nur bei Änderungen).
  useEffect(() => {
    if (!client || !localEncryption || version === 0) return;
    const timer = setTimeout(() => {
      void client
        .searchSnapshot()
        .then((s) => (s ? saveSearchSnapshot(db, session.umk(), s) : undefined))
        .catch(() => undefined); // gesperrt oder Worker beendet: der nächste Durchgang sichert
    }, PERSIST_INDEX_MS);
    return () => clearTimeout(timer);
  }, [client, localEncryption, version, db, session]);

  const api = useMemo(() => ({ client: version > 0 ? client : null, version }), [client, version]);
  return <AnalysisContext.Provider value={api}>{children}</AnalysisContext.Provider>;
}

export const useAnalysis = (): AnalysisApi => useContext(AnalysisContext);
