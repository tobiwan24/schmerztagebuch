// Gemeinsame Darstellung für Ansichten, die Einträge laden: Laden / Fehler / leer / Liste.
import type { Entry } from '@stb/core';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/StateView';
import type { QueryState } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function EntryListState({
  query, emptyTitle, emptyHint, onRetry,
}: { query: QueryState<Entry[]>; emptyTitle: string; emptyHint: string; onRetry: () => void }) {
  if (query.status === 'loading') return <p className="text-muted-foreground">{de.app.loading}</p>;
  if (query.status === 'error') return <ErrorState onRetry={onRetry} />;
  if (query.data.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <Card data-testid="entry-list" className="gap-0 py-0">
      {query.data.map((e) => (
        <div key={e.id} className="border-b px-4 py-3 last:border-b-0">
          {new Date(e.occurredAt).toLocaleString('de-DE')}
        </div>
      ))}
    </Card>
  );
}
