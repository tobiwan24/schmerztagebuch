// Sortierung des Verlaufs, pro Gerät in `device` gemerkt (ANA-20, A-052).
import { useCallback, useEffect, useState } from 'react';
import { SORT_ORDERS, type SortOrder } from '@stb/analysis';
import { useAuth } from '@/auth/AuthContext';

const STORE_ID = 'history-sort';

export function useHistorySort(): [SortOrder, (s: SortOrder) => void] {
  const { db } = useAuth();
  const [sort, setSort] = useState<SortOrder>('newest');
  useEffect(() => {
    let cancelled = false;
    void db.device.get(STORE_ID).then((row) => {
      const v = row?.value;
      if (!cancelled && typeof v === 'string' && (SORT_ORDERS as readonly string[]).includes(v)) setSort(v as SortOrder);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);
  const select = useCallback(
    (s: SortOrder) => {
      setSort(s);
      void db.device.put({ id: STORE_ID, value: s });
    },
    [db],
  );
  return [sort, select];
}
