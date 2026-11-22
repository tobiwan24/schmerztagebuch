// Lade-, Leer- und Fehlerzustand für Repository-Abfragen (Spec 10: jede Ansicht hat Lade-, Leer- und Fehlerzustand).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from './DataContext';

export type QueryState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: unknown };

export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[]): QueryState<T> & { retry: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Fremde Änderungen (Sync-Pull) laden still nach — wie `retry`, ohne Ladezustand.
  const { revision } = useData();
  const lastDeps = useRef<readonly unknown[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Neue Abfrage (andere deps) → Ladezustand. Nur `retry` (z. B. nach dem Speichern) → vorhandene Daten bleiben
    // sichtbar, bis die neuen da sind (kein Flackern, Fokus bleibt erhalten).
    const sameDeps = lastDeps.current !== null && lastDeps.current.length === deps.length && lastDeps.current.every((d, i) => Object.is(d, deps[i]));
    lastDeps.current = deps;
    setState((prev) => (sameDeps && prev.status === 'ok' ? prev : { status: 'loading' }));
    load().then(
      (data) => !cancelled && setState({ status: 'ok', data }),
      (error: unknown) => !cancelled && setState({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
    // `load` ist pro Render neu; neu geladen wird über `deps` und `retry`.
  }, [...deps, attempt, revision]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
