// Einträge nach Tagen gruppiert (Spec 10 „Verlauf"), mit Lade-, Fehler- und Leerzustand. Zeile öffnet das Detail.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { SortOrder } from '@stb/analysis';
import type { Entry } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { entryDay, formatDay, formatEntryTime } from '@/lib/entry-format';
import { PAGE_SIZE, pageGroups } from '@/lib/history-list';
import { de } from '@/i18n/de';

const timeOnly = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

function rowTime(e: Entry): string {
  return e.period ? `${formatEntryTime(e)} · ${de.entry.period}` : timeOnly.format(new Date(e.occurredAt));
}

/** `onlyIds`: nur diese Einträge zeigen (Filter aktiv); `null` = alle. */
export function EntryListState({ emptyTitle, emptyHint, onlyIds = null, allowAllDiaries = false, sort = 'newest' }: { emptyTitle: string; emptyHint: string; onlyIds?: ReadonlySet<string> | null; allowAllDiaries?: boolean; sort?: SortOrder }) {
  const { diary, now } = useData();
  const { diaryId } = useDiaryScope(allowAllDiaries);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Andere Sortierung, anderer Filter oder anderes Tagebuch → wieder mit der ersten Seite beginnen
  useEffect(() => setLimit(PAGE_SIZE), [sort, onlyIds, diaryId]);
  const query = useQuery(async () => {
    const [entries, templates] = await Promise.all([diary.listAllEntries(), diary.listAllTemplates()]);
    return { entries, names: new Map(templates.map((t) => [t.id, t.name])) };
  }, [diary]);
  if (query.status === 'loading') return <p className="text-muted-foreground">{de.app.loading}</p>;
  if (query.status === 'error') return <ErrorState onRetry={query.retry} />;
  const scoped = diaryId ? query.data.entries.filter((e) => e.diaryId === diaryId) : query.data.entries;
  if (scoped.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  const shown = onlyIds ? scoped.filter((e) => onlyIds.has(e.id)) : scoped;
  if (shown.length === 0) return <EmptyState title={de.history.noMatches} hint={de.history.noMatchesHint} />;
  const { groups, total } = pageGroups(
    shown.map((e) => ({ ...e, templateName: query.data.names.get(e.templateId) ?? '' })),
    sort,
    limit,
  );
  return (
    <div data-testid="entry-list" className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2" data-testid="entry-day">
          <h2 className="text-sm font-medium text-muted-foreground">{'day' in g.by ? formatDay(g.by.day, now()) : g.by.template}</h2>
          <Card className="gap-0 py-0">
            {g.entries.map((e) => (
              <Link key={e.id} to={`/entry/${e.id}`} data-testid="entry-row" className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0">
                <span className="flex flex-col">
                  <span className="tabular-nums">{'template' in g.by ? `${formatDay(entryDay(e), now())} · ${rowTime(e)}` : rowTime(e)}</span>
                  <span className="text-xs text-muted-foreground">{e.templateName}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </Card>
        </section>
      ))}
      {total > limit ? (
        <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          {de.history.loadMore(Math.min(PAGE_SIZE, total - limit))}
        </Button>
      ) : null}
    </div>
  );
}
