// Eintrag: neu (`/entry/new`), bearbeiten (`/entry/:id/edit`), Detail (`/entry/:id`) — Spec 05/10, Wireframes eintrag/verlauf.
import { Link, useParams } from 'react-router';
import { Pencil } from 'lucide-react';
import { AttachmentList } from '@/components/AttachmentList';
import { useAuthorName } from '@/data/useSharing';
import { displayValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { EntryForm } from '@/components/EntryForm';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { formatEntryTime } from '@/lib/entry-format';
import { de } from '@/i18n/de';

export function EntryEditorPage() {
  const { id } = useParams();
  const { diary } = useData();
  const { diaryId } = useDiaryScope(false);
  const query = useQuery(async () => {
    // Vorauswahl: Vorlagen des gewählten Tagebuchs zuerst (UI-24)
    const all = (await diary.listAllTemplates()).filter((t) => !t.archived);
    const templates = diaryId ? [...all.filter((t) => t.diaryId === diaryId), ...all.filter((t) => t.diaryId !== diaryId)] : all;
    return { templates, entry: id ? await diary.getEntry(id) : undefined };
  }, [diary, id, diaryId]);
  return (
    <>
      <PageHeader title={id ? de.entry.editTitle : de.entry.newTitle} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && id && !query.data.entry ? <EmptyState title={de.entry.notFound} hint="" /> : null}
      {query.status === 'ok' && !id && query.data.templates.length === 0 ? (
        <>
          <EmptyState title={de.entry.noTemplateTitle} hint={de.entry.noTemplateHint} />
          <Button asChild variant="outline">
            <Link to="/more/templates">{de.entry.toTemplates}</Link>
          </Button>
        </>
      ) : null}
      {query.status === 'ok' && (id ? query.data.entry : query.data.templates.length > 0) ? (
        <EntryForm templates={query.data.templates} entry={query.data.entry} />
      ) : null}
    </>
  );
}

export function EntryDetailPage() {
  const { id = '' } = useParams();
  const { diary } = useData();
  const query = useQuery(async () => {
    const view = await diary.getEntryView(id);
    const tpl = view ? await diary.getTemplate(view.entry.templateId) : undefined;
    return view ? { ...view, templateName: tpl?.template.name ?? '' } : undefined;
  }, [diary, id]);
  return (
    <>
      <PageHeader title={de.entry.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && !query.data ? <EmptyState title={de.entry.notFound} hint="" /> : null}
      {query.status === 'ok' && query.data ? (
        <>
          <div className="flex flex-col gap-1">
            <p data-testid="entry-time" className="text-lg font-semibold tabular-nums">
              {formatEntryTime(query.data.entry)}
              {query.data.entry.period ? <span className="ml-2 text-sm font-normal text-muted-foreground">{de.entry.period}</span> : null}
            </p>
            <p className="text-sm text-muted-foreground">{query.data.templateName}</p>
            <AuthorLine diaryId={query.data.entry.diaryId} authorId={query.data.entry.authorId} />
          </div>
          <Card className="gap-0 py-0">
            {query.data.fields
              .map((f) => ({ ...f, text: displayValue(f.block, f.value) }))
              .filter((f) => f.text !== '')
              .map((f) => (
                <div key={f.block.id} data-testid="entry-field" className="flex items-start justify-between gap-4 border-b px-4 py-3 last:border-b-0">
                  <span className="text-sm text-muted-foreground">
                    {f.block.label}
                    {f.archived ? <span className="ml-2 text-xs">{de.entry.archivedField}</span> : null}
                  </span>
                  <span className="text-right">{f.text}</span>
                </div>
              ))}
          </Card>
          <AttachmentList ids={attachmentIdsOf(query.data.fields)} />
          <Button asChild variant="outline">
            <Link to={`/entry/${id}/edit`}>
              <Pencil aria-hidden />
              {de.entry.edit}
            </Link>
          </Button>
        </>
      ) : null}
    </>
  );
}

/** Anhang-IDs aller Textarea-Felder eines Eintrags (Reihenfolge der Felder). */
function attachmentIdsOf(fields: readonly { block: { type: string }; value: unknown }[]): string[] {
  return fields.flatMap((f) => (f.block.type === 'textarea' ? ((f.value as { attachmentIds?: string[] } | undefined)?.attachmentIds ?? []) : []));
}

/** „Erfasst von …" — nur in geteilten Tagebüchern (Spec 09, SHR-10). */
function AuthorLine({ diaryId, authorId }: { diaryId: string; authorId: string }) {
  const name = useAuthorName(diaryId, authorId);
  if (name.status !== 'ok' || !name.data) return null;
  return <p data-testid="entry-author" className="text-sm text-muted-foreground">{de.entry.recordedBy(name.data)}</p>;
}
