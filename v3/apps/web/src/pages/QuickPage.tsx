// Schnelleintrag (Spec 05, Wireframe schnelleintrag.html): Tipp 1 „Schnell eintragen" · Tipp 2 Wert · Tipp 3 Speichern.
// Zeitpunkt = jetzt, `meta.source = 'quick'`; weitere Felder später im Eintrag ergänzbar. Pflichtfelder gelten hier nicht.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { quickEntrySelection, valuesToSave, type Entry, type FormValues, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { BlockField } from '@/components/blocks/BlockField';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function QuickPage() {
  const data = useData();
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>({});
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const query = useQuery(async () => {
    const [diary] = await data.diary.listDiaries();
    if (!diary) return null;
    const states = (await Promise.all((await data.diary.listTemplates(diary.id)).map((t) => data.diary.getTemplate(t.id)))).filter(
      (s): s is TemplateState => s !== undefined,
    );
    return quickEntrySelection(diary, states);
  }, [data.diary]);

  async function save() {
    if (query.status !== 'ok' || !query.data) return;
    const { state } = query.data;
    const toSave = valuesToSave(state.version, values);
    if (Object.keys(toSave).length === 0) return setEmpty(true);
    setSaving(true);
    try {
      const s = await data.stamper.stamp();
      const entry: Entry = {
        id: data.newId(), diaryId: state.template.diaryId, templateId: state.template.id, templateVersion: state.version.version,
        occurredAt: s.at, recordedAt: s.at, updatedAt: s.at, authorId: s.authorId, values: toSave, tags: [],
        meta: { source: 'quick', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, hlc: s.hlc,
      };
      await data.diary.saveEntry(entry);
      void navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={de.quick.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && (!query.data || query.data.blocks.length === 0) ? (
        <>
          <EmptyState title={de.quick.noBlocksTitle} hint={de.quick.noBlocksHint} />
          <Button asChild variant="outline">
            <Link to="/entry/new">{de.start.newEntry}</Link>
          </Button>
        </>
      ) : null}
      {query.status === 'ok' && query.data && query.data.blocks.length > 0 ? (
        <form className="flex flex-col gap-6" noValidate onSubmit={(e) => (e.preventDefault(), void save())}>
          <p className="text-sm text-muted-foreground">{de.quick.now(query.data.state.template.name)}</p>
          {query.data.blocks.map((def) => (
            <BlockField key={def.id} def={def} value={values[def.id]} invalid={false} onChange={(v) => (setValues({ ...values, [def.id]: v }), setEmpty(false))} />
          ))}
          {empty ? (
            <p role="alert" className="text-sm text-destructive">
              {de.quick.emptyHint}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={saving}>
            {saving ? de.entry.saving : de.entry.save}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/entry/new">{de.quick.moreFields}</Link>
          </Button>
        </form>
      ) : null}
    </>
  );
}
