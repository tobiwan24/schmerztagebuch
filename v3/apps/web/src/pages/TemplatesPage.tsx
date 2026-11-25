// Mehr → Vorlagen (Spec 05/10): Liste nach `order` mit Drag & Drop (Pointer/Touch + Pfeiltasten am Griff), Archivieren,
// endgültiges Löschen nur mit Bestätigung und Anzahl betroffener Einträge (BLK-15), Anlage aus dem Vorlagenkatalog
// (eigene Einträge und mitgelieferte Vorlagen, RDM-034) und „Zum Vorlagenkatalog hinzufügen“ je aktiver Vorlage.
// Reihenfolge ändert nur `Template.order` (Fractional Index) — keine neue Vorlagenversion.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { Archive, ArchiveRestore, BookPlus, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { TEMPLATE_CATALOG, catalogEntryFrom, instantiateCatalogTemplate, keyBetween, type Template } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/PageHeader';
import { TemplateIcon } from '@/components/TemplateIcon';
import { EmptyState, ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useCanEditTemplates } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { addToCatalog, instantiateCatalogEntry, refreshInCatalog, useCatalogDeps } from '@/data/template-catalog';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';
import { deTemplates } from '@/i18n/lazy/templates';

interface Row {
  template: Template;
  entries: number;
}

interface CatalogRow {
  template: Template;
  fields: number;
}

export function TemplatesPage() {
  const data = useData();
  const scope = useDiaryScope(false);
  const query = useQuery(async () => {
    const all = await data.diary.listDiaries();
    const diary = all.find((d) => d.id === scope.diaryId) ?? all[0];
    if (!diary) return { diaryId: null, rows: [] as Row[] };
    const templates = await data.diary.listTemplates(diary.id);
    const rows = await Promise.all(templates.map(async (t) => ({ template: t, entries: await data.diary.countTemplateEntries(t.id) })));
    return { diaryId: diary.id, rows: rows.sort((a, b) => (a.template.order < b.template.order ? -1 : a.template.order > b.template.order ? 1 : 0)) };
  }, [data.diary, scope.diaryId]);
  const canEdit = useCanEditTemplates(query.status === 'ok' ? query.data.diaryId : null) !== false;
  const [deleting, setDeleting] = useState<Row | null>(null);
  // Vorlagenkatalog (RDM-034): eigene Einträge aus der Bibliothek, mit Anzahl Felder
  const catalogDeps = useCatalogDeps();
  const catalog = useQuery(async () => {
    const list = await data.diary.listCatalogTemplates();
    return Promise.all(list.map(async (t): Promise<CatalogRow> => ({ template: t, fields: (await data.diary.getTemplate(t.id))?.version.blocks.length ?? 0 })));
  }, [data.diary]);
  const catalogRows = catalog.status === 'ok' ? catalog.data : [];
  const [existing, setExisting] = useState<{ source: Template; entry: Template } | null>(null);
  const [removingEntry, setRemovingEntry] = useState<CatalogRow | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<string | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);

  async function catalogAction(run: () => Promise<string>) {
    setCatalogBusy(true);
    try {
      setCatalogStatus(await run());
    } catch {
      setCatalogStatus(deTemplates.catalogError);
    } finally {
      setCatalogBusy(false);
      catalog.retry();
      query.retry();
    }
  }

  function onAddToCatalog(t: Template) {
    const entry = catalogEntryFrom(catalogRows.map((r) => r.template), t.id);
    if (entry) return setExisting({ source: t, entry });
    void catalogAction(async () => deTemplates.catalogAdded((await addToCatalog(catalogDeps, t.id)).template.name));
  }

  async function removeCatalogEntry(row: CatalogRow) {
    setRemovingEntry(null);
    await catalogAction(async () => {
      const s = await data.stamper.stamp();
      await data.diary.deleteTemplate(row.template.id, { hlc: s.hlc, updatedAt: s.at });
      return deTemplates.catalogRemoved(row.template.name);
    });
  }

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
      <PageHeader title={deTemplates.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' ? (
        <>
          {canEdit ? null : <p role="status" className="text-sm text-muted-foreground">{deTemplates.readOnly}</p>}
          {query.data.rows.filter((r) => !r.template.archived).length === 0 ? <EmptyState title={deTemplates.emptyTitle} hint={deTemplates.emptyHint} /> : null}
          <SortableTemplates
            key={query.data.rows.map((r) => r.template.id + r.template.order + String(r.template.archived)).join()}
            rows={query.data.rows.filter((r) => !r.template.archived)}
            busy={pending > 0}
            readOnly={!canEdit}
            onMove={(t, order) => void saveMeta(t, { order })}
            onArchive={(t) => void saveMeta(t, { archived: true })}
            onDelete={setDeleting}
            onAddToCatalog={catalogBusy ? undefined : onAddToCatalog}
          />
          {catalogStatus ? <p role="status" data-testid="catalog-status" className="text-sm text-muted-foreground">{catalogStatus}</p> : null}
          {query.data.rows.some((r) => r.template.archived) ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{deTemplates.archived}</h2>
              <Card className="gap-0 py-0" data-testid="archived-templates">
                {query.data.rows
                  .filter((r) => r.template.archived)
                  .map((r) => (
                    <div key={r.template.id} className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2 last:border-b-0">
                      <span className="flex flex-col">
                        <span>{r.template.name}</span>
                        <span className="text-xs text-muted-foreground">{deTemplates.entryCount(r.entries)}</span>
                      </span>
                      <span className="flex gap-1">
                        {canEdit ? <>
                        <Button variant="ghost" size="icon" aria-label={deTemplates.restore(r.template.name)} onClick={() => void saveMeta(r.template, { archived: false })}>
                          <ArchiveRestore aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={deTemplates.delete(r.template.name)} onClick={() => setDeleting(r)}>
                          <Trash2 aria-hidden />
                        </Button>
                        </> : null}
                      </span>
                    </div>
                  ))}
              </Card>
            </section>
          ) : null}
          {query.data.diaryId && canEdit ? (
            <Button asChild variant="outline">
              <Link to="/more/templates/new">
                <Plus aria-hidden />
                {deTemplates.create}
              </Link>
            </Button>
          ) : null}
          {query.data.diaryId && (canEdit || catalogRows.length > 0) ? (
            <section className="flex flex-col gap-3" data-testid="template-catalog">
              <h2 className="text-sm font-medium text-muted-foreground">{deTemplates.fromCatalog}</h2>
              {catalogRows.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="catalog-own">
                  <h3 className="text-xs font-medium text-muted-foreground">{deTemplates.catalogOwn}</h3>
                  {catalogRows.map((r) => (
                    <div key={r.template.id} className="flex items-center gap-2" data-testid="catalog-own-row">
                      <Button
                        variant="outline"
                        className="h-auto min-w-0 flex-1 justify-start py-3 text-left"
                        disabled={!canEdit || catalogBusy}
                        onClick={() => void catalogAction(async () => deTemplates.catalogCreated((await instantiateCatalogEntry(catalogDeps, r.template.id, query.data.diaryId!)).template.name))}
                      >
                        <TemplateIcon icon={r.template.icon} color={r.template.color} />
                        <span className="flex min-w-0 flex-col whitespace-normal">
                          <span>{r.template.name}</span>
                          <span className="text-xs text-muted-foreground">{deTemplates.fieldCount(r.fields)}</span>
                        </span>
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={deTemplates.catalogRemove(r.template.name)} disabled={catalogBusy} onClick={() => setRemovingEntry(r)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {canEdit ? (
                <div className="flex flex-col gap-2" data-testid="catalog-builtin">
                  {catalogRows.length > 0 ? <h3 className="text-xs font-medium text-muted-foreground">{deTemplates.catalogBuiltin}</h3> : null}
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
              ) : null}
            </section>
          ) : null}
          <CatalogExistsDialog
            state={existing}
            onCancel={() => setExisting(null)}
            onRefresh={(x) => {
              setExisting(null);
              void catalogAction(async () => deTemplates.catalogUpdated((await refreshInCatalog(catalogDeps, x.entry.id, x.source.id)).template.name));
            }}
            onAddNew={(x) => {
              setExisting(null);
              void catalogAction(async () => deTemplates.catalogAdded((await addToCatalog(catalogDeps, x.source.id)).template.name));
            }}
          />
          <CatalogRemoveDialog row={removingEntry} onCancel={() => setRemovingEntry(null)} onConfirm={(r) => void removeCatalogEntry(r)} />
          <DeleteDialog row={deleting} onCancel={() => setDeleting(null)} onConfirm={(r) => void remove(r)} />
        </>
      ) : null}
    </>
  );
}

function SortableTemplates({
  rows: initial, busy, readOnly, onMove, onArchive, onDelete, onAddToCatalog,
}: {
  rows: Row[];
  busy: boolean;
  readOnly: boolean;
  onMove: (t: Template, order: string) => void;
  onArchive: (t: Template) => void;
  onDelete: (r: Row) => void;
  /** Auch bei nur lesbaren Tagebüchern (R3, Kopie in den eigenen Vorlagenkatalog); `undefined` = gerade beschäftigt. */
  onAddToCatalog: ((t: Template) => void) | undefined;
}) {
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
          {readOnly ? null : <Button
            variant="ghost"
            size="icon"
            className="cursor-grab touch-none"
            aria-label={deTemplates.move(r.template.name)}
            aria-description={deTemplates.moveHint}
            onPointerDown={(e) => onPointerDown(e, r.template.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(e) => onKeyDown(e, r.template.id)}
          >
            <GripVertical aria-hidden />
          </Button>}
          <TemplateIcon icon={r.template.icon} color={r.template.color} />
          <span className="flex min-w-0 flex-1 flex-col break-words">
            <span>{r.template.name}</span>
            <span className="text-xs text-muted-foreground">{deTemplates.entryCount(r.entries)}</span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={deTemplates.addToCatalogFor(r.template.name)} disabled={!onAddToCatalog} onClick={() => onAddToCatalog?.(r.template)}>
                <BookPlus aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{deTemplates.addToCatalog}</TooltipContent>
          </Tooltip>
          {readOnly ? null : <Button asChild variant="ghost" size="icon">
            <Link to={`/more/templates/${r.template.id}`} aria-label={deTemplates.edit(r.template.name)}>
              <Pencil aria-hidden />
            </Link>
          </Button>}
          {readOnly ? null : <Button variant="ghost" size="icon" aria-label={deTemplates.archive(r.template.name)} onClick={() => onArchive(r.template)}>
            <Archive aria-hidden />
          </Button>}
          {!readOnly && r.entries === 0 ? (
            <Button variant="ghost" size="icon" aria-label={deTemplates.delete(r.template.name)} onClick={() => onDelete(r)}>
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
          <DialogTitle id="delete-template-title">{deTemplates.deleteTitle(row.template.name)}</DialogTitle>
          <DialogDescription data-testid="delete-count">{deTemplates.deleteHint(row.entries)}</DialogDescription>
          {needsConfirm ? (
            <div className="mt-4 flex items-center gap-3">
              <Checkbox id="delete-understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <Label htmlFor="delete-understood" className="font-normal">
                {deTemplates.deleteConfirm}
              </Label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => (setUnderstood(false), onCancel())}>
              {de.lock.cancel}
            </Button>
            <Button variant="destructive" disabled={needsConfirm && !understood} onClick={() => (setUnderstood(false), onConfirm(row))}>
              {deTemplates.deleteFinal}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  );
}

function CatalogExistsDialog({
  state, onCancel, onRefresh, onAddNew,
}: {
  state: { source: Template; entry: Template } | null;
  onCancel: () => void;
  onRefresh: (s: { source: Template; entry: Template }) => void;
  onAddNew: (s: { source: Template; entry: Template }) => void;
}) {
  return (
    <Dialog open={state !== null} onClose={onCancel} aria-labelledby="catalog-exists-title">
      {state ? (
        <>
          <DialogTitle id="catalog-exists-title">{deTemplates.catalogExistsTitle(state.entry.name)}</DialogTitle>
          <DialogDescription>{deTemplates.catalogExistsHint}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              {de.lock.cancel}
            </Button>
            <Button variant="outline" onClick={() => onAddNew(state)}>
              {deTemplates.catalogAddNew}
            </Button>
            <Button onClick={() => onRefresh(state)}>{deTemplates.catalogRefresh}</Button>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  );
}

function CatalogRemoveDialog({ row, onCancel, onConfirm }: { row: CatalogRow | null; onCancel: () => void; onConfirm: (r: CatalogRow) => void }) {
  return (
    <Dialog open={row !== null} onClose={onCancel} aria-labelledby="catalog-remove-title">
      {row ? (
        <>
          <DialogTitle id="catalog-remove-title">{deTemplates.catalogRemoveTitle(row.template.name)}</DialogTitle>
          <DialogDescription>{deTemplates.catalogRemoveHint}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              {de.lock.cancel}
            </Button>
            <Button variant="destructive" onClick={() => onConfirm(row)}>
              {deTemplates.catalogRemoveConfirm}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  );
}
