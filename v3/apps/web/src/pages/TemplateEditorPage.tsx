// Vorlagen-Editor (Spec 05 „Vorlagen-Editor", A-037): Route `/more/templates/new` und `/more/templates/:id`.
// Name/Icon/Farbe ändern nur `Template` (keine neue Version); Änderungen an den Blöcken erzeugen Version n+1.
// Blockeditor: Palette, Bezeichnung, Pflicht, Rolle, Konfiguration, Umsortieren, Entfernen; Warnung bei ungespeicherten Änderungen.
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { Copy } from 'lucide-react';
import { canonical, compareByOrder, createTemplate, duplicateTemplate, keyBetween, parseFunctionPhases, updateTemplate, validateTemplateDraft, type BlockDef, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LlmRolesButton } from '@/components/LlmRolesButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { BlockEditor } from '@/components/template-editor/BlockEditor';
import { resolveTemplateColor, resolveTemplateIcon } from '@/lib/template-style';
import { DEFAULT_TEMPLATE_COLOR, DEFAULT_TEMPLATE_ICON } from '@/components/TemplateIcon';
import { TemplateStylePicker } from '@/components/TemplateStylePicker';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useCanEditTemplates } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';
import { deTemplates } from '@/i18n/lazy/templates';

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
  const owner = useCanEditTemplates(query.status === 'ok' && query.data ? query.data.diaryId : null);

  return (
    <>
      <PageHeader title={id ? deTemplates.editor.titleEdit : deTemplates.editor.titleNew} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && query.data === null ? <ErrorState detail={deTemplates.editor.notFound} /> : null}
      {query.status === 'ok' && query.data && owner === false ? <ErrorState detail={deTemplates.readOnly} /> : null}
      {query.status === 'ok' && query.data && owner === true ? <EditorForm key={id ?? 'new'} loaded={query.data} /> : null}
    </>
  );
}

function EditorForm({ loaded }: { loaded: Loaded }) {
  const data = useData();
  const navigate = useNavigate();
  const { state } = loaded;
  const [name, setName] = useState(state?.template.name ?? '');
  const [icon, setIcon] = useState<string>(() => resolveTemplateIcon(state?.template.icon ?? DEFAULT_TEMPLATE_ICON));
  const [color, setColor] = useState<string>(() => state ? resolveTemplateColor(state.template.color) : DEFAULT_TEMPLATE_COLOR);
  const [blocks, setBlocks] = useState<BlockDef[]>(() => [...(state?.version.blocks ?? [])].sort(compareByOrder));
  const [quickIds, setQuickIds] = useState<string[]>(state?.template.quickBlockIds ?? []);
  const [training, setTraining] = useState(state?.template.purpose === 'training');
  const [phasesText, setPhasesText] = useState((state?.template.functionPhases ?? []).join(', '));
  const phases = parseFunctionPhases(phasesText);
  const [draftId] = useState(() => data.newId());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ungespeicherte Änderungen: Vergleich mit dem Ausgangszustand (Hinzufügen und wieder Entfernen ist keine Änderung, BLK-25).
  // Schnelleintrag-Auswahl nur für noch vorhandene Blöcke, in Vorlagen-Reihenfolge (A-070).
  const quickOf = (b: readonly BlockDef[], q: readonly string[]) => [...b].sort(compareByOrder).filter((x) => q.includes(x.id)).map((x) => x.id);
  const snapshot = (n: string, i: string, c: string, b: readonly BlockDef[], q: readonly string[], tr: boolean, ph: readonly number[]) =>
    canonical({ n, i, c, b: [...b].sort(compareByOrder), q: quickOf(b, q), tr, ph: tr ? ph : [] });
  const currentSnapshot = () => snapshot(name, icon, color, blocks, quickIds, training, phases.phases);
  const initialSnapshot = useRef(currentSnapshot());
  const dirty = currentSnapshot() !== initialSnapshot.current;
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
    if (showErrors) for (const i of issues) if (i.blockId) m.set(i.blockId, [...(m.get(i.blockId) ?? []), deTemplates.editor.issues[i.code]]);
    return m;
  }, [issues, showErrors]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (issues.length > 0 || (training && phases.invalid)) return setShowErrors(true);
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (state) {
        // Name/Icon/Farbe sind Metadaten (keine neue Version); geänderte Blöcke ergeben Version n+1 (DM-06).
        const quick = quickOf(blocks, quickIds);
        const next = updateTemplate(
          state,
          { name: trimmed, icon, color, blocks, quickBlockIds: quick.length ? quick : null, purpose: training ? 'training' : null, functionPhases: training && phases.phases.length ? phases.phases : null },
          { now: data.now },
        );
        if (next.newVersion) await data.diary.saveTemplate(next.state);
        else await data.diary.saveTemplateMeta(next.state.template);
      } else {
        await data.diary.saveTemplate(
          createTemplate({ id: data.newId(), diaryId: loaded.diaryId, name: trimmed, icon, color, order: keyBetween(loaded.lastOrder, null), blocks, ...(quickOf(blocks, quickIds).length ? { quickBlockIds: quickOf(blocks, quickIds) } : {}), ...(training ? { purpose: 'training' as const } : {}), ...(training && phases.phases.length ? { functionPhases: phases.phases } : {}) }, { now: data.now }),
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
        <Label htmlFor="template-name">{deTemplates.editor.name}</Label>
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
            {deTemplates.editor.nameRequired}
          </p>
        ) : null}
      </div>
      <TemplateStylePicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Checkbox id="template-training" checked={training} onChange={(e) => setTraining(e.target.checked)} aria-describedby="template-training-hint" />
          <Label htmlFor="template-training" className="font-normal">
            {deTemplates.editor.training.toggle}
          </Label>
        </div>
        <p id="template-training-hint" className="text-sm text-muted-foreground">
          {deTemplates.editor.training.toggleHint}
        </p>
        {training ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-phases">{deTemplates.editor.training.phases}</Label>
            <Input
              id="template-phases"
              inputMode="numeric"
              value={phasesText}
              aria-invalid={showErrors && phases.invalid}
              aria-describedby="template-phases-hint"
              onChange={(e) => setPhasesText(e.target.value)}
            />
            <p id="template-phases-hint" className={cn('text-sm', showErrors && phases.invalid ? 'text-destructive' : 'text-muted-foreground')}>
              {showErrors && phases.invalid ? deTemplates.editor.training.phasesInvalid : deTemplates.editor.training.phasesHint}
            </p>
          </div>
        ) : null}
      </div>
      <LlmRolesButton templateName={name} templateId={state?.template.id ?? draftId} blocks={blocks} valid={issues.length === 0} now={new Date(data.now()).toISOString()} onBlocks={setBlocks} />
      <div data-tour="editor-blocks" className={TOUR_RING}>
      <BlockEditor training={training} blocks={blocks} issues={blockIssues} newId={data.newId} onChange={setBlocks} quickIds={quickIds} onQuickChange={(id, on) => setQuickIds(on ? [...quickIds, id] : quickIds.filter((x) => x !== id))} />
      </div>
      <div data-tour="editor-save" className={cn('flex flex-col gap-2', TOUR_RING)}>
        <Button type="submit" disabled={busy}>
          {deTemplates.editor.save}
        </Button>
        {state ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void duplicate()}>
            <Copy aria-hidden />
            {deTemplates.editor.duplicate}
          </Button>
        ) : null}
      </div>
      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} aria-labelledby="discard-template-title">
        <DialogTitle id="discard-template-title">{deTemplates.editor.discardTitle}</DialogTitle>
        <DialogDescription>{deTemplates.editor.discardHint}</DialogDescription>
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
