// Ansichten-Gerüst laut Wireframes (G1). Inhalte folgen mit den jeweiligen Meilensteinen (M8, M9, M12).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { FilterSpec } from '@stb/analysis';
import { EMPTY_FILTER, HistoryFilters, isActive, toSpec, type FilterState } from '@/components/HistoryFilters';
import { useAnalysis } from '@/data/AnalysisContext';
import { ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { EntryListState } from '@/components/EntryListState';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function HistoryPage() {
  const { diary, now } = useData();
  const { client, version } = useAnalysis();
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  const meta = useQuery(async () => {
    const [diaries, versions] = await Promise.all([diary.listDiaries(), diary.listAllTemplateVersions()]);
    const medOptionIds = [...new Set(versions.flatMap((v) => v.blocks.flatMap((b) => (b.role === 'medication' && b.type === 'multiselect' ? b.config.options.map((o) => o.id) : []))))];
    return { diaryIds: diaries.map((d) => d.id), medOptionIds };
  }, [diary]);
  const diaryIds = meta.status === 'ok' ? meta.data.diaryIds : [];
  const medOptionIds = meta.status === 'ok' ? meta.data.medOptionIds : [];
  const active = isActive(filter);
  const specKey = JSON.stringify(active ? toSpec(filter, diaryIds, medOptionIds) : null);

  useEffect(() => {
    if (!active) return setIds(null);
    if (!client) return;
    let cancelled = false;
    void client.filter(JSON.parse(specKey) as FilterSpec, now()).then((r) => !cancelled && setIds(new Set(r)));
    return () => {
      cancelled = true;
    };
  }, [active, client, version, specKey, now]);

  return (
    <>
      <PageHeader title={de.history.title} />
      {diaryIds.length ? <HistoryFilters state={filter} onChange={setFilter} diaryIds={diaryIds} medOptionIds={medOptionIds} /> : null}
      {active && !ids ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {!active || ids ? <EntryListState emptyTitle={de.history.emptyTitle} emptyHint={de.history.emptyHint} onlyIds={active ? ids : null} /> : null}
      <Button asChild variant="outline">
        <Link to="/entry/new">
          <Plus aria-hidden />
          {de.start.newEntry}
        </Link>
      </Button>
    </>
  );
}

export function AnalysisPage() {
  const { diary } = useData();
  const entries = useQuery(() => diary.listAllEntries(), [diary]);
  return (
    <>
      <PageHeader title={de.analysis.title} />
      {entries.status === 'error' ? <ErrorState onRetry={entries.retry} /> : null}
      {entries.status === 'ok' && entries.data.length === 0 ? <EmptyState title={de.analysis.emptyTitle} hint={de.analysis.emptyHint} /> : null}
    </>
  );
}

const MORE_LINKS = [
  { to: '/more/templates', label: de.more.templates },
  { to: '/more/diaries', label: de.more.diaries },
  { to: '/more/export', label: de.more.export },
  { to: '/more/settings', label: de.more.settings },
] as const;

export function MorePage() {
  return (
    <>
      <PageHeader title={de.more.title} />
      <Card className="gap-0 py-0">
        {MORE_LINKS.map(({ to, label }) => (
          <Link key={to} to={to} className="flex min-h-12 items-center justify-between border-b px-4 last:border-b-0">
            {label}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </Card>
    </>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return <PageHeader title={title} back />;
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader title={de.notFound.title} />
      <Button asChild variant="outline">
        <Link to="/">{de.notFound.toStart}</Link>
      </Button>
    </>
  );
}
