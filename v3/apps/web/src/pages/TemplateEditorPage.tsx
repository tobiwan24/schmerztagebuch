// Vorlagen-Editor (Spec 05 „Vorlagen-Editor", A-037): Route `/more/templates/new` und `/more/templates/:id`.
// Name/Icon/Farbe ändern nur `Template` (keine neue Version); Änderungen an den Blöcken erzeugen Version n+1.
// Blockeditor: Palette, Bezeichnung, Pflicht, Rolle, Konfiguration, Umsortieren, Entfernen; Warnung bei ungespeicherten Änderungen.
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { Copy } from 'lucide-react';
import { canonical, compareByOrder, createTemplate, duplicateTemplate, keyBetween, updateTemplate, validateTemplateDraft, type BlockDef, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { BlockEditor } from '@/components/template-editor/BlockEditor';
import { DEFAULT_TEMPLATE_COLOR, DEFAULT_TEMPLATE_ICON } from '@/components/TemplateIcon';
import { TemplateStylePicker } from '@/components/TemplateStylePicker';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useIsOwner } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

interface Loaded {
  diaryId: string;
  state: TemplateState | null;
  /** Order-Key der Vorlage direkt nach der bearbeiteten (für „Duplizieren") bzw. der letzten (für „Neu"). */
  nextOrder: string | null;
  lastOrder: string | null;
}

export function TemplateEditorPage() {
  const { id } = useParams();
  const data = useData();
  const scope = useDiaryScope(false);
  const query = useQuery<Loaded | null>(async () => {
    const state = id ? ((await data.diary.getTemplate(id)) ?? null) : null;
    if (id && !state) return null;
    // Bestehende Vorlage: ihr Tagebuch; neue: das gewählte Tagebuch (sonst das erste)
    const all = await data.diary.listDiaries();
    const diary = state ? all.find((d) => d.id === state.template.diaryId) : (all.find((d) => d.id === scope.diaryId) ?? all[0]);
    if (!diary) return null;
    const orders = (await data.diary.listTemplates(diary.id)).map((t) => t.order).sort();
    const after = state ? orders.filter((o) => o > state.template.order)[0] ?? null : null;
    return { diaryId: diary.id, state, nextOrder: after, lastOrder: orders.at(-1) ?? null };
  }, [data.diary, id, scope.diaryId]);
  const owner = useIsOwner(query.status === 'ok' && query.data ? query.data.diaryId : null);

  return (
    <>
      <PageHeader title={id ? de.templates.editor.titleEdit : de.templates.editor.titleNew} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && query.data === null ? <ErrorState detail={de.templates.editor.notFound} /> : null}
      {query.status === 'ok' && query.data && owner === false ? <ErrorState detail={de.templates.readOnly} /> : null}
      {query.status === 'ok' && query.data && owner === true ? <EditorForm key={id ?? 'new'} loaded={query.data} /> : null}
    </>
  );
}

function EditorForm({ loaded }: { loaded: Loaded }) {
  const data = useData();
  const navigate = useNavigate();
  const { state } = loaded;
  const [name, setName] = useState(state?.template.name ?? '');
  const [icon, setIcon] = useState(state?.template.icon ?? DEFAULT_TEMPLATE_ICON);
  const [color, setColor] = useState(state?.template.color ?? DEFAULT_TEMPLATE_COLOR);
  const [blocks, setBlocks] = useState<BlockDef[]>(() => [...(state?.version.blocks ?? [])].sort(compareByOrder));
  const [quickIds, setQuickIds] = useState<string[]>(state?.template.quickBlockIds ?? []);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ungespeicherte Änderungen: Vergleich mit dem Ausgangszustand (Hinzufügen und wieder Entfernen ist keine Änderung, BLK-25).
  // Schnelleintrag-Auswahl nur für noch vorhandene Blöcke, in Vorlagen-Reihenfolge (A-070).
  const quickOf = (b: readonly BlockDef[], q: readonly string[]) => [...b].sort(compareByOrder).filter((x) => q.includes(x.id)).map((x) => x.id);
  const snapshot = (n: string, i: string, c: string, b: readonly BlockDef[], q: readonly string[]) => canonical({ n, i, c, b: [...b].sort(compareByOrder), q: quickOf(b, q) });
  const initialSnapshot = useRef(snapshot(name, icon, color, blocks, quickIds));
  const dirty = snapshot(name, icon, color, blocks, quickIds) !== initialSnapshot.current;
  const leaving = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const issues = useMemo(() => validateTemplateDraft({ name, blocks }), [name, blocks]);
  const nameInvalid = showErrors && issues.some((i) => i.code === 'NAME_EMPTY');
  const blockIssues = useMemo(() => {
    const m = new Map<string, string[]>();
    if (showErrors) for (const i of issues) if (i.blockId) m.set(i.blockId, [...(m.get(i.blockId) ?? []), de.templates.editor.issues[i.code]]);
    return m;
  }, [issues, showErrors]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (issues.length > 0) return setShowErrors(true);
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (state) {
        // Name/Icon/Farbe sind Metadaten (keine neue Version); geänderte Blöcke ergeben Version n+1 (DM-06).
        const quick = quickOf(blocks, quickIds);
        const next = updateTemplate(state, { name: trimmed, icon, color, blocks, quickBlockIds: quick.length ? quick : null }, { now: data.now });
        if (next.newVersion) await data.diary.saveTemplate(next.state);
        else await data.diary.saveTemplateMeta(next.state.template);
      } else {
        await data.diary.saveTemplate(
          createTemplate({ id: data.newId(), diaryId: loaded.diaryId, name: trimmed, icon, color, order: keyBetween(loaded.lastOrder, null), blocks, ...(quickOf(blocks, quickIds).length ? { quickBlockIds: quickOf(blocks, quickIds) } : {}) }, { now: data.now }),
        );
      }
      leaving.current = true;
      void navigate('/more/templates');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!state) return;
    setBusy(true);
    try {
      const copy = duplicateTemplate(state, { newId: data.newId }, { now: data.now }, loaded.nextOrder);
      await data.diary.saveTemplate(copy);
      leaving.current = true;
      void navigate(`/more/templates/${copy.template.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={(e) => void save(e)}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="template-name">{de.templates.editor.name}</Label>
        <Input
          id="template-name"
          value={name}
          maxLength={80}
          aria-invalid={nameInvalid}
          aria-describedby={nameInvalid ? 'template-name-error' : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {nameInvalid ? (
          <p id="template-name-error" className="text-sm text-destructive">
            {de.templates.editor.nameRequired}
          </p>
        ) : null}
      </div>
      <TemplateStylePicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <div data-tour="editor-blocks" className={TOUR_RING}>
      <BlockEditor blocks={blocks} issues={blockIssues} newId={data.newId} onChange={setBlocks} quickIds={quickIds} onQuickChange={(id, on) => setQuickIds(on ? [...quickIds, id] : quickIds.filter((x) => x !== id))} />
      </div>
      <div data-tour="editor-save" className={cn('flex flex-col gap-2', TOUR_RING)}>
        <Button type="submit" disabled={busy}>
          {de.templates.editor.save}
        </Button>
        {state ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void duplicate()}>
            <Copy aria-hidden />
            {de.templates.editor.duplicate}
          </Button>
        ) : null}
      </div>
      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} aria-labelledby="discard-template-title">
        <DialogTitle id="discard-template-title">{de.templates.editor.discardTitle}</DialogTitle>
        <DialogDescription>{de.templates.editor.discardHint}</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
            {de.entry.keepEditing}
          </Button>
          <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
            {de.entry.discard}
          </Button>
        </DialogFooter>
      </Dialog>
    </form>
  );
}
