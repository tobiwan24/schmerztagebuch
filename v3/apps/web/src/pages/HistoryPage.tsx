// Verlauf mit Filtern und Sortierung (M14b). Eigene Datei, damit die Seite per `lazy` nachgeladen wird (QA-02).
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import type { FilterSpec } from '@stb/analysis';
import { EMPTY_FILTER, HistoryFilters, isActive, toSpec, type FilterState } from '@/components/HistoryFilters';
import { useAnalysis } from '@/data/AnalysisContext';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useHistorySort } from '@/data/use-history-sort';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function HistoryPage() {
  const { diary, now } = useData();
  const { client, version } = useAnalysis();
  // Vom Start-Hinweis „n neue Einträge von X“ (SHR-15): Verlauf nach diesem Autor vorfiltern
  const fromNotice = (useLocation().state as { authorId?: unknown } | null)?.authorId;
  const [filter, setFilter] = useState<FilterState>(() => ({ ...EMPTY_FILTER, authorId: typeof fromNotice === 'string' ? fromNotice : '' }));
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
      <PageHeader title={de.history.title} sync />
      <HistoryFilters state={filter} onChange={setFilter} diaryIds={diaryIds} medOptionIds={medOptionIds} templates={templates} sort={sort} onSortChange={setSort} />
      {active && !ids ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {!active || ids ? <EntryListState emptyTitle={de.history.emptyTitle} emptyHint={de.history.emptyHint} onlyIds={active ? ids : null} allowAllDiaries sort={sort} /> : null}
    </>
  );
}
