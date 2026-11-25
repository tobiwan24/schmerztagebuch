// Verlauf-Cards (Spec 10, RDM-028 P3): Symbol, Titel, Datum/Uhrzeit, Kennzeichen, Schmerzwert; ohne Tagesüberschriften. Lade-, Fehler- und Leerzustand; Zeile öffnet das Detail.
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Calendar, ChevronRight, FileText, Image, Map as MapIcon, Stethoscope, type LucideIcon } from 'lucide-react';
import type { SortOrder } from '@stb/analysis';
import type { AttachmentMeta, BlockDef, Entry, TemplateVersion } from '@stb/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/StateView';
import { TemplateIconBadge } from '@/components/TemplateIcon';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { entryCardMeta, type EntryCardMeta, type PainTone } from '@/lib/entry-card-meta';
import { formatEntryTime } from '@/lib/entry-format';
import { PAGE_SIZE, pageGroups } from '@/lib/history-list';
import { de } from '@/i18n/de';

function rowTime(e: Entry): string {
  return e.period ? `${formatEntryTime(e)} · ${de.entry.period}` : formatEntryTime(e);
}

/** Statische Klassen, damit Tailwind sie findet. */
const PAIN_CLASS: Record<PainTone, string> = { green: 'text-green-600', amber: 'text-amber-600', orange: 'text-orange-600', red: 'text-red-600' };

const FLAG_BADGES: { key: keyof EntryCardMeta['flags']; icon: LucideIcon; label: string }[] = [
  { key: 'event', icon: Calendar, label: de.history.chipEvents },
  { key: 'doctor', icon: Stethoscope, label: de.history.content.doctor },
  { key: 'bodymap', icon: MapIcon, label: de.history.content.bodymap },
  { key: 'image', icon: Image, label: de.history.content.image },
  { key: 'pdf', icon: FileText, label: de.history.content.pdf },
];

/** `onlyIds`: nur diese Einträge zeigen (Filter aktiv); `null` = alle. */
export function EntryListState({ emptyTitle, emptyHint, onlyIds = null, allowAllDiaries = false, sort = 'newest' }: { emptyTitle: string; emptyHint: string; onlyIds?: ReadonlySet<string> | null; allowAllDiaries?: boolean; sort?: SortOrder }) {
  const { diary, attachments } = useData();
  const { diaryId } = useDiaryScope(allowAllDiaries);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Andere Sortierung, anderer Filter oder anderes Tagebuch → wieder mit der ersten Seite beginnen
  useEffect(() => setLimit(PAGE_SIZE), [sort, onlyIds, diaryId]);
  const query = useQuery(async () => {
    const [entries, templates, versions, metas] = await Promise.all([diary.listAllEntries(), diary.listAllTemplates(), diary.listAllTemplateVersions(), attachments.listAll()]);
    return { entries, templates, versions, metas };
  }, [diary, attachments]);
  const data = query.status === 'ok' ? query.data : undefined;
  const lookups = useMemo(() => {
    if (!data) return undefined;
    const { templates, versions, metas } = data;
    const versionMap = new Map<string, TemplateVersion>(versions.map((v) => [`${v.templateId}#${v.version}`, v]));
    const byEntry = new Map<string, AttachmentMeta[]>();
    for (const m of metas) {
      const list = byEntry.get(m.entryId);
      if (list) list.push(m);
      else byEntry.set(m.entryId, [m]);
    }
    return { templateMap: new Map(templates.map((t) => [t.id, t])), versionMap, byEntry };
  }, [data]);
  if (query.status === 'loading') return <p className="text-muted-foreground">{de.app.loading}</p>;
  if (query.status === 'error') return <ErrorState onRetry={query.retry} />;
  if (!data || !lookups) return null;
  const scoped = diaryId ? data.entries.filter((e) => e.diaryId === diaryId) : data.entries;
  if (scoped.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  const shown = onlyIds ? scoped.filter((e) => onlyIds.has(e.id)) : scoped;
  if (shown.length === 0) return <EmptyState title={de.history.noMatches} hint={de.history.noMatchesHint} />;
  const { groups, total } = pageGroups(
    shown.map((e) => ({ ...e, templateName: lookups.templateMap.get(e.templateId)?.name ?? '' })),
    sort,
    limit,
  );
  return (
    <div data-testid="entry-list" data-tour="history-list" className={cn('flex flex-col gap-4', TOUR_RING)}>
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          {g.by ? <h2 className="text-sm font-medium text-muted-foreground">{g.by.template}</h2> : null}
          <Card className="gap-0 py-0">
            {g.entries.map((e) => {
              const tpl = lookups.templateMap.get(e.templateId);
              const cur = tpl ? lookups.versionMap.get(`${tpl.id}#${tpl.currentVersion}`)?.blocks : undefined;
              const blocks: readonly BlockDef[] = lookups.versionMap.get(`${e.templateId}#${e.templateVersion}`)?.blocks ?? cur ?? [];
              const meta = entryCardMeta(e, blocks, cur, lookups.byEntry.get(e.id) ?? []);
              return (
                <Link key={e.id} to={`/entry/${e.id}`} data-testid="entry-row" className="flex min-h-12 items-center gap-3 border-b px-4 py-3 last:border-b-0">
                  <TemplateIconBadge icon={tpl?.icon} color={tpl?.color} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium" data-testid="entry-title" title={e.templateName || undefined}>
                      {meta.title ?? (e.templateName || de.history.unknownTemplate)}
                      {meta.title && e.templateName ? <span className="sr-only"> ({e.templateName})</span> : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="tabular-nums">{rowTime(e)}</span>
                      {FLAG_BADGES.filter((f) => meta.flags[f.key]).map(({ key, icon: Icon, label }) => (
                        <Badge key={key} variant="secondary" role="img" aria-label={label} title={label} data-testid={`entry-flag-${key}`}>
                          <Icon className="size-3" aria-hidden />
                        </Badge>
                      ))}
                    </span>
                  </span>
                  {meta.pain !== undefined && meta.painTone ? (
                    <span className={cn('text-xl font-bold tabular-nums', PAIN_CLASS[meta.painTone])} data-testid="entry-pain" aria-label={de.history.painLabel(meta.pain)} role="img">
                      {meta.pain}
                    </span>
                  ) : null}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              );
            })}
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
