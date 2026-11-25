// Diagnose (Spec 10 „Funktionsparität": Version, Sync-Status, Outbox, Speicher — ohne Klartextdaten, UI-09).
// Liefert nur Zahlen und technische Zustände, nie Inhalte von Einträgen oder Vorlagen.
import { useAuth } from '@/auth/AuthContext';
import { APP_VERSION } from '@/version';
import { useQuery } from './useQuery';

export interface Diagnostics {
  version: string;
  accountMode: string;
  outbox: number;
  outboxErrors: number;
  blobOutbox: number;
  records: { kind: string; count: number }[];
  storage: { usage: number; quota: number } | null;
  persisted: boolean | null;
  serviceWorker: 'active' | 'none' | 'unsupported';
}

export function useDiagnostics() {
  const { db, accountMode } = useAuth();
  return useQuery<Diagnostics>(async () => {
    const [outbox, blobOutbox, recs] = await Promise.all([db.outbox.toArray(), db.blob_outbox.count(), db.records.toArray()]);
    const byKind = new Map<string, number>();
    for (const r of recs) if (!r.deleted) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    const est = await navigator.storage?.estimate?.().catch(() => null);
    const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : null;
    return {
      version: APP_VERSION,
      accountMode: accountMode ?? 'none',
      outbox: outbox.length,
      outboxErrors: outbox.filter((o) => o.lastError).length,
      blobOutbox,
      records: [...byKind].map(([kind, count]) => ({ kind, count })).sort((x, y) => x.kind.localeCompare(y.kind)),
      storage: est && est.quota ? { usage: est.usage ?? 0, quota: est.quota } : null,
      persisted,
      serviceWorker: reg === null ? 'unsupported' : reg?.active ? 'active' : 'none',
    };
  }, [db, accountMode]);
}
