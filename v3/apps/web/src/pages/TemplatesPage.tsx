// Mehr → Vorlagen (Spec 05/10): Liste nach `order` mit Drag & Drop (Pointer/Touch + Pfeiltasten am Griff), Archivieren,
// endgültiges Löschen nur mit Bestätigung und Anzahl betroffener Einträge (BLK-15), Anlage aus dem Katalog.
// Reihenfolge ändert nur `Template.order` (Fractional Index) — keine neue Vorlagenversion.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { Archive, ArchiveRestore, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { TEMPLATE_CATALOG, instantiateCatalogTemplate, keyBetween, type Template } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { TemplateIcon } from '@/components/TemplateIcon';
import { EmptyState, ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

interface Row {
  template: Template;
  entries: number;
}

export function TemplatesPage() {
  const data = useData();
  const query = useQuery(async () => {
    const [diary] = await data.diary.listDiaries();
    if (!diary) return { diaryId: null, rows: [] as Row[] };
    const templates = await data.diary.listTemplates(diary.id);
    const rows = await Promise.all(templates.map(async (t) => ({ template: t, entries: await data.diary.countTemplateEntries(t.id) })));
    return { diaryId: diary.id, rows: rows.sort((a, b) => (a.template.order < b.template.order ? -1 : a.template.order > b.template.order ? 1 : 0)) };
  }, [data.diary]);
  const [deleting, setDeleting] = useState<Row | null>(null);

  // Änderungen nacheinander speichern: schnelles Ziehen + Pfeiltaste dürfen sich nicht überholen (letzte Aktion gewinnt).
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  function saveMeta(t: Template, patch: Partial<Pick<Template, 'order' | 'archived'>>) {
    setPending((n) => n + 1);
    queue.current = queue.current
      .then(async () => {
        const stored = await data.diary.getTemplate(t.id);
        if (!stored) return;
        await data.diary.saveTemplateMeta({ ...stored.template, ...patch, updatedAt: new Date(data.now()).toISOString() });
      })
      .finally(() => {
        setPending((n) => n - 1);
        query.retry();
      });
    return queue.current;
  }

  async function addFromCatalog(catalogId: string, diaryId: string, rows: Row[]) {
    const last = rows.map((r) => r.template.order).sort().at(-1) ?? null;
    const state = instantiateCatalogTemplate(catalogId, { id: data.newId(), diaryId, order: keyBetween(last, null), newId: data.newId }, { now: data.now });
    await data.diary.saveTemplate(state);
    query.retry();
  }

  async function remove(row: Row) {
    const s = await data.stamper.stamp();
    await data.diary.deleteTemplate(row.template.id, { hlc: s.hlc, updatedAt: s.at });
    setDeleting(null);
    query.retry();
  }

  return (
    <>
      <PageHeader title={de.templates.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' ? (
        <>
          {query.data.rows.filter((r) => !r.template.archived).length === 0 ? <EmptyState title={de.templates.emptyTitle} hint={de.templates.emptyHint} /> : null}
          <SortableTemplates
            key={query.data.rows.map((r) => r.template.id + r.template.order + String(r.template.archived)).join()}
            rows={query.data.rows.filter((r) => !r.template.archived)}
            busy={pending > 0}
            onMove={(t, order) => void saveMeta(t, { order })}
            onArchive={(t) => void saveMeta(t, { archived: true })}
            onDelete={setDeleting}
          />
          {query.data.rows.some((r) => r.template.archived) ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{de.templates.archived}</h2>
              <Card className="gap-0 py-0" data-testid="archived-templates">
                {query.data.rows
                  .filter((r) => r.template.archived)
                  .map((r) => (
                    <div key={r.template.id} className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2 last:border-b-0">
                      <span className="flex flex-col">
                        <span>{r.template.name}</span>
                        <span className="text-xs text-muted-foreground">{de.templates.entryCount(r.entries)}</span>
                      </span>
                      <span className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={de.templates.restore(r.template.name)} onClick={() => void saveMeta(r.template, { archived: false })}>
                          <ArchiveRestore aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={de.templates.delete(r.template.name)} onClick={() => setDeleting(r)}>
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    </div>
                  ))}
              </Card>
            </section>
          ) : null}
          {query.data.diaryId ? (
            <Button asChild variant="outline">
              <Link to="/more/templates/new">
                <Plus aria-hidden />
                {de.templates.create}
              </Link>
            </Button>
          ) : null}
          {query.data.diaryId ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{de.templates.fromCatalog}</h2>
              <div className="flex flex-col gap-2">
                {TEMPLATE_CATALOG.map((c) => (
                  <Button key={c.id} variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => void addFromCatalog(c.id, query.data.diaryId!, query.data.rows)}>
                    <Plus aria-hidden />
                    <span className="flex flex-col whitespace-normal">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.description}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
          <DeleteDialog row={deleting} onCancel={() => setDeleting(null)} onConfirm={(r) => void remove(r)} />
        </>
      ) : null}
    </>
  );
}

function SortableTemplates({
  rows: initial, busy, onMove, onArchive, onDelete,
}: { rows: Row[]; busy: boolean; onMove: (t: Template, order: string) => void; onArchive: (t: Template) => void; onDelete: (r: Row) => void }) {
  const [rows, setRows] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());

  /** Neue Order zwischen den Nachbarn an der Zielposition; nur speichern, wenn sich die Position geändert hat. */
  function commit(list: Row[], id: string) {
    const i = list.findIndex((r) => r.template.id === id);
    if (i === initial.findIndex((r) => r.template.id === id)) return;
    const order = keyBetween(list[i - 1]?.template.order ?? null, list[i + 1]?.template.order ?? null);
    onMove(list[i]!.template, order);
  }

  function moveTo(list: Row[], id: string, target: number): Row[] {
    const from = list.findIndex((r) => r.template.id === id);
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(target, next.length)), 0, item!);
    return next;
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!dragId) return;
    const others = rows.filter((r) => r.template.id !== dragId);
    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      const rect = refs.current.get(others[i]!.template.id)?.getBoundingClientRect();
      if (rect && e.clientY < rect.top + rect.height / 2) {
        target = i;
        break;
      }
    }
    if (rows.findIndex((r) => r.template.id === dragId) !== target) setRows(moveTo(rows, dragId, target));
  }

  function onPointerUp() {
    if (!dragId) return;
    commit(rows, dragId);
    setDragId(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const from = rows.findIndex((r) => r.template.id === id);
    const next = moveTo(rows, id, from + (e.key === 'ArrowUp' ? -1 : 1));
    setRows(next);
    commit(next, id);
  }

  if (rows.length === 0) return null;
  return (
    <Card className="gap-0 py-0" data-testid="template-list" aria-busy={busy}>
      {rows.map((r) => (
        <div
          key={r.template.id}
          ref={(el) => {
            if (el) refs.current.set(r.template.id, el);
            else refs.current.delete(r.template.id);
          }}
          data-testid="template-row"
          className={cn('flex min-h-12 items-center gap-2 border-b px-2 py-2 last:border-b-0', dragId === r.template.id && 'bg-accent')}
        >
          <Button
            variant="ghost"
            size="icon"
            className="cursor-grab touch-none"
            aria-label={de.templates.move(r.template.name)}
            aria-description={de.templates.moveHint}
            onPointerDown={(e) => onPointerDown(e, r.template.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(e) => onKeyDown(e, r.template.id)}
          >
            <GripVertical aria-hidden />
          </Button>
          <TemplateIcon icon={r.template.icon} color={r.template.color} />
          <span className="flex flex-1 flex-col">
            <span>{r.template.name}</span>
            <span className="text-xs text-muted-foreground">{de.templates.entryCount(r.entries)}</span>
          </span>
          <Button asChild variant="ghost" size="icon">
            <Link to={`/more/templates/${r.template.id}`} aria-label={de.templates.edit(r.template.name)}>
              <Pencil aria-hidden />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label={de.templates.archive(r.template.name)} onClick={() => onArchive(r.template)}>
            <Archive aria-hidden />
          </Button>
          {r.entries === 0 ? (
            <Button variant="ghost" size="icon" aria-label={de.templates.delete(r.template.name)} onClick={() => onDelete(r)}>
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      ))}
    </Card>
  );
}

function DeleteDialog({ row, onCancel, onConfirm }: { row: Row | null; onCancel: () => void; onConfirm: (r: Row) => void }) {
  const [understood, setUnderstood] = useState(false);
  const needsConfirm = (row?.entries ?? 0) > 0;
  return (
    <Dialog open={row !== null} onClose={() => (setUnderstood(false), onCancel())} aria-labelledby="delete-template-title">
      {row ? (
        <>
          <DialogTitle id="delete-template-title">{de.templates.deleteTitle(row.template.name)}</DialogTitle>
          <DialogDescription data-testid="delete-count">{de.templates.deleteHint(row.entries)}</DialogDescription>
          {needsConfirm ? (
            <div className="mt-4 flex items-center gap-3">
              <Checkbox id="delete-understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <Label htmlFor="delete-understood" className="font-normal">
                {de.templates.deleteConfirm}
              </Label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => (setUnderstood(false), onCancel())}>
              {de.lock.cancel}
            </Button>
            <Button variant="destructive" disabled={needsConfirm && !understood} onClick={() => (setUnderstood(false), onConfirm(row))}>
              {de.templates.deleteFinal}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  );
}
