// Eintrag: neu (`/entry/new`), bearbeiten (`/entry/:id/edit`), Detail (`/entry/:id`) — Spec 05/10, Wireframes eintrag/verlauf.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { AttachmentList } from '@/components/AttachmentList';
import { useAuthorName } from '@/data/useSharing';
import { displayValue, duplicateEntryInput, type BodymapValue, type TextareaValue } from '@stb/core';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { EntryForm, type EntryPrefill } from '@/components/EntryForm';
import { BodyMapView } from '@/components/blocks/BodyMapField';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { formatEntryTime } from '@/lib/entry-format';
import { de } from '@/i18n/de';

export function EntryEditorPage() {
  const { id } = useParams();
  const { diary } = useData();
  const { diaryId } = useDiaryScope(false);
  const [params] = useSearchParams();
  const from = params.get('from');
  const wantedTemplate = params.get('template');
  const query = useQuery(async () => {
    // Vorauswahl: Vorlagen des gewählten Tagebuchs zuerst (UI-24)
    const all = (await diary.listAllTemplates()).filter((t) => !t.archived);
    const templates = diaryId ? [...all.filter((t) => t.diaryId === diaryId), ...all.filter((t) => t.diaryId !== diaryId)] : all;
    // Duplizieren (BLK-36): Vorbelegung aus dem Original, nur wenn dessen Vorlage noch wählbar ist
    let prefill: EntryPrefill | undefined;
    const source = !id && from ? await diary.getEntry(from) : undefined;
    if (source && templates.some((t) => t.id === source.templateId)) {
      const [entryVersion, current] = await Promise.all([diary.getTemplateVersion(source.templateId, source.templateVersion), diary.getTemplate(source.templateId)]);
      if (entryVersion && current) {
        const { templateId, values, tags } = duplicateEntryInput(source, entryVersion, current.version);
        prefill = { templateId, values, tags };
      }
    }
    // Vorlage aus der Kachel auf Start (BLK-44), nur wenn sie wählbar ist
    if (!prefill && !id && wantedTemplate && templates.some((t) => t.id === wantedTemplate)) prefill = { templateId: wantedTemplate, values: {}, tags: [] };
    return { templates, entry: id ? await diary.getEntry(id) : undefined, prefill };
  }, [diary, id, diaryId, from, wantedTemplate]);
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
        <EntryForm key={from ?? id ?? wantedTemplate ?? 'new'} templates={query.data.templates} entry={query.data.entry} prefill={query.data.prefill} />
      ) : null}
    </>
  );
}

export function EntryDetailPage() {
  const { id = '' } = useParams();
  const { diary, attachments, stamper } = useData();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery(async () => {
    const view = await diary.getEntryView(id);
    const tpl = view ? await diary.getTemplate(view.entry.templateId) : undefined;
    return view ? { ...view, templateName: tpl?.template.name ?? '' } : undefined;
  }, [diary, id]);
  async function remove(diaryId: string) {
    setBusy(true);
    try {
      const s = await stamper.stamp();
      for (const a of await attachments.listForEntry(diaryId, id)) await attachments.remove(a.id);
      await diary.deleteEntry(id, { hlc: s.hlc, updatedAt: s.at });
      void navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

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
          {query.data.fields
            .filter((f) => f.block.type === 'bodymap' && f.value !== undefined)
            .map((f) => (
              <BodyMapView key={f.block.id} value={f.value as BodymapValue} diaryId={query.data!.entry.diaryId} label={f.block.label} />
            ))}
          {eventsOf(query.data.fields).length > 0 ? (
            <section className="flex flex-col gap-2" data-testid="events">
              <h2 className="text-sm font-medium text-muted-foreground">{de.entry.eventsHeading}</h2>
              <Card className="gap-0 py-0">
                {eventsOf(query.data.fields).map((e) => (
                  <div key={e.id} data-testid="event" className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
                    <span>{e.title}</span>
                    <Badge variant="secondary">{e.category === 'doctor' ? de.entry.categoryDoctor : de.entry.categoryEvent}</Badge>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}
          {query.data.entry.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label={de.entry.tagsSet}>
              {query.data.entry.tags.map((t) => (
                <li key={t}>
                  <Badge data-testid="tag-chip">{t}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <AttachmentList ids={attachmentIdsOf(query.data.fields)} />
          <Button asChild variant="outline">
            <Link to={`/entry/${id}/edit`}>
              <Pencil aria-hidden />
              {de.entry.edit}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/entry/new?from=${id}`}>
              <Copy aria-hidden />
              {de.entry.duplicate}
            </Link>
          </Button>
          <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden />
            {de.entry.delete}
          </Button>
          <Dialog open={deleting} onClose={() => setDeleting(false)} aria-labelledby="delete-entry-title">
            <DialogTitle id="delete-entry-title">{de.entry.deleteTitle}</DialogTitle>
            <DialogDescription>{de.entry.deleteText}</DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(false)}>{de.entry.deleteCancel}</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void remove(query.data!.entry.diaryId)}>{de.entry.deleteConfirm}</Button>
            </DialogFooter>
          </Dialog>
        </>
      ) : null}
    </>
  );
}

/** Anhang-IDs aller Textarea-Felder eines Eintrags (Reihenfolge der Felder). */
function attachmentIdsOf(fields: readonly { block: { type: string }; value: unknown }[]): string[] {
  return fields.flatMap((f) => (f.block.type === 'textarea' ? ((f.value as { attachmentIds?: string[] } | undefined)?.attachmentIds ?? []) : []));
}

/** Ereignisse und Arztbesuche aller Textarea-Felder eines Eintrags. */
function eventsOf(fields: readonly { block: { type: string }; value: unknown }[]): { id: string; category: 'event' | 'doctor'; title: string }[] {
  return fields.flatMap((f) => (f.block.type === 'textarea' ? ((f.value as TextareaValue | undefined)?.events ?? []) : []));
}

/** „Erfasst von …" — nur in geteilten Tagebüchern (Spec 09, SHR-10). */
function AuthorLine({ diaryId, authorId }: { diaryId: string; authorId: string }) {
  const name = useAuthorName(diaryId, authorId);
  if (name.status !== 'ok' || !name.data) return null;
  return <p data-testid="entry-author" className="text-sm text-muted-foreground">{de.entry.recordedBy(name.data)}</p>;
}
