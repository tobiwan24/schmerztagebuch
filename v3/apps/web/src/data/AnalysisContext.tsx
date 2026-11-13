// Analyse im Web Worker (Spec 06 „Arbeitsset"): nach dem Entsperren Worker starten und das Arbeitsset aus den
// Repositories laden; bei lokalen Änderungen (`writes`) und übernommenen fremden Änderungen (`revision`) neu laden.
// `version` steigt nach jedem Laden — Ansichten nehmen es in ihre Abfrage-Abhängigkeiten auf.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createAnalysisClient, type AnalysisClient } from '@/workers/analysis-service';
import { useData } from './DataContext';

export interface AnalysisApi {
  client: AnalysisClient | null;
  /** Steigt nach jedem (Neu-)Laden des Arbeitssets. */
  version: number;
}

const AnalysisContext = createContext<AnalysisApi>({ client: null, version: 0 });

const RELOAD_DEBOUNCE_MS = 250;

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { diary, writes, revision } = useData();
  const [client, setClient] = useState<AnalysisClient | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(0);

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
      const [entries, templates, versions, diaries] = await Promise.all([
        diary.listAllEntries(), diary.listAllTemplates(), diary.listAllTemplateVersions(), diary.listDiaries(),
      ]);
      await client.load({ entries, templates, versions, diaries });
      if (!cancelled) setVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, diary, revision, dirty]);

  const api = useMemo(() => ({ client: version > 0 ? client : null, version }), [client, version]);
  return <AnalysisContext.Provider value={api}>{children}</AnalysisContext.Provider>;
}

export const useAnalysis = (): AnalysisApi => useContext(AnalysisContext);
