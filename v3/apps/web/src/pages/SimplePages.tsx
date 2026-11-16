// Ansichten-Gerüst laut Wireframes (G1). Inhalte folgen mit den jeweiligen Meilensteinen (M8, M9, M12).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { SORT_ORDERS, type FilterSpec, type SortOrder } from '@stb/analysis';
import { EMPTY_FILTER, HistoryFilters, isActive, toSpec, type FilterState } from '@/components/HistoryFilters';
import { useAnalysis } from '@/data/AnalysisContext';
import { ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useHistorySort } from '@/data/use-history-sort';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function HistoryPage() {
  const { diary, now } = useData();
  const { client, version } = useAnalysis();
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [sort, setSort] = useHistorySort();
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  const meta = useQuery(async () => {
    const [diaries, versions] = await Promise.all([diary.listDiaries(), diary.listAllTemplateVersions()]);
    const medOptionIds = [...new Set(versions.flatMap((v) => v.blocks.flatMap((b) => (b.role === 'medication' && b.type === 'multiselect' ? b.config.options.map((o) => o.id) : []))))];
    const templates = await diary.listAllTemplates();
    return { diaryIds: diaries.map((d) => d.id), medOptionIds, templates: templates.map((t) => ({ id: t.id, name: t.name, diaryId: t.diaryId })) };
  }, [diary]);
  const scope = useDiaryScope(true);
  const diaryIds = meta.status === 'ok' ? (scope.diaryId ? [scope.diaryId] : meta.data.diaryIds) : [];
  const medOptionIds = meta.status === 'ok' ? meta.data.medOptionIds : [];
  const templates = meta.status === 'ok' ? meta.data.templates.filter((t) => diaryIds.includes(t.diaryId)) : [];
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
      {diaryIds.length ? <HistoryFilters state={filter} onChange={setFilter} diaryIds={diaryIds} medOptionIds={medOptionIds} templates={templates} /> : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="history-sort">{de.history.sort}</Label>
        <Select id="history-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOrder)}>
          {SORT_ORDERS.map((o) => (
            <option key={o} value={o}>
              {de.history.sorts[o]}
            </option>
          ))}
        </Select>
      </div>
      {diaryIds.length ? (
        // Export mit den aktuell angewendeten Filtern (EXP-18, A-073): FilterSpec als Router-State an die Export-Seite.
        <Button asChild variant="outline" className="self-start">
          <Link to="/more/export" state={{ filter: toSpec(filter, diaryIds, medOptionIds) }}>
            <Download aria-hidden />
            {de.history.export}
          </Link>
        </Button>
      ) : null}
      {active && !ids ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {!active || ids ? <EntryListState emptyTitle={de.history.emptyTitle} emptyHint={de.history.emptyHint} onlyIds={active ? ids : null} allowAllDiaries sort={sort} /> : null}
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
