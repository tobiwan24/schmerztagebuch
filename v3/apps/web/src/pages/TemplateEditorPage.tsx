// Vorlagen-Editor (Spec 05 „Vorlagen-Editor", A-037): Route `/more/templates/new` und `/more/templates/:id`.
// Dieser Stand: leere Vorlage anlegen, Name/Icon/Farbe ändern (nur `Template`, keine neue Version), Duplizieren.
// Der Blockeditor folgt (M14.4a ff.).
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Copy } from 'lucide-react';
import { createTemplate, duplicateTemplate, keyBetween, validateTemplateDraft, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { DEFAULT_TEMPLATE_COLOR, DEFAULT_TEMPLATE_ICON } from '@/components/TemplateIcon';
import { TemplateStylePicker } from '@/components/TemplateStylePicker';
import { useData } from '@/data/DataContext';
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
  const query = useQuery<Loaded | null>(async () => {
    const [diary] = await data.diary.listDiaries();
    if (!diary) return null;
    const orders = (await data.diary.listTemplates(diary.id)).map((t) => t.order).sort();
    const state = id ? ((await data.diary.getTemplate(id)) ?? null) : null;
    if (id && !state) return null;
    const after = state ? orders.filter((o) => o > state.template.order)[0] ?? null : null;
    return { diaryId: diary.id, state, nextOrder: after, lastOrder: orders.at(-1) ?? null };
  }, [data.diary, id]);

  return (
    <>
      <PageHeader title={id ? de.templates.editor.titleEdit : de.templates.editor.titleNew} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && query.data === null ? <ErrorState detail={de.templates.editor.notFound} /> : null}
      {query.status === 'ok' && query.data ? <EditorForm key={id ?? 'new'} loaded={query.data} /> : null}
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
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameInvalid = showErrors && validateTemplateDraft({ name, blocks: [] }).length > 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (validateTemplateDraft({ name, blocks: [] }).length > 0) return setShowErrors(true);
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (state) {
        // Name/Icon/Farbe sind Metadaten der Vorlage — keine neue Version (DM-06).
        await data.diary.saveTemplateMeta({ ...state.template, name: trimmed, icon, color, updatedAt: new Date(data.now()).toISOString() });
      } else {
        await data.diary.saveTemplate(
          createTemplate({ id: data.newId(), diaryId: loaded.diaryId, name: trimmed, icon, color, order: keyBetween(loaded.lastOrder, null), blocks: [] }, { now: data.now }),
        );
      }
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
      <div className="flex flex-col gap-2">
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
    </form>
  );
}
