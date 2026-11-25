// Verlauf-Filter nur im Speicher (A-146): bleibt beim Wechsel Verlauf → Detail → zurück erhalten, ist nach einem
// Neustart der App (Reload) wieder leer. Bewusst kein Storage, kein Sync.
import { useCallback, useState } from 'react';
import { EMPTY_FILTER, type FilterState } from '@/components/HistoryFilters';

let current: FilterState = EMPTY_FILTER;
/** Navigation (`location.key`), deren Vorgabe schon übernommen wurde — bei Zurück aus der Detailansicht nicht erneut. */
let appliedKey: string | undefined;

export const readHistoryFilter = (): FilterState => current;
export const writeHistoryFilter = (s: FilterState) => {
  current = s;
};

/** Zustand des Verlauf-Filters; `initial` (z. B. Autor vom Start-Hinweis, SHR-15) ersetzt einmal je Navigation `key` den gemerkten Stand. */
export function useHistoryFilter(initial?: FilterState, key?: string): [FilterState, (s: FilterState) => void] {
  const [state, setState] = useState<FilterState>(() => {
    if (initial && key !== appliedKey) {
      appliedKey = key;
      writeHistoryFilter(initial);
    }
    return current;
  });
  const set = useCallback((s: FilterState) => {
    writeHistoryFilter(s);
    setState(s);
  }, []);
  return [state, set];
}
