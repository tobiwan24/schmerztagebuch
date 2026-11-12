// Lade-, Leer- und Fehlerzustand für Repository-Abfragen (Spec 10: jede Ansicht hat Lade-, Leer- und Fehlerzustand).
import { useCallback, useEffect, useState } from 'react';

export type QueryState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: unknown };

export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[]): QueryState<T> & { retry: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    load().then(
      (data) => !cancelled && setState({ status: 'ok', data }),
      (error: unknown) => !cancelled && setState({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
    // `load` ist pro Render neu; neu geladen wird über `deps` und `retry`.
  }, [...deps, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
