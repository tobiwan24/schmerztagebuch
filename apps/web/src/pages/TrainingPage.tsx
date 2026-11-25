// Training (UI-30, Spec 10 „Training"): aktuelle Funktionsphase und passende Trainingsvorlagen; ein Tipp startet den
// Durchgang. Training baut auf Vorlagen und Einträgen auf — keine eigenen Tabellen (A-084).
import { useState } from 'react';
import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { trainingTemplatesFor, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { TemplateIcon } from '@/components/TemplateIcon';
import { TrainingRun } from '@/components/TrainingRun';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useWritableDiaries } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';
import { deTraining } from '@/i18n/lazy/training';

const t = deTraining;

interface Group {
  diaryId: string;
  diaryName: string;
  phase: number | null;
  templates: TemplateState[];
}

export function TrainingPage() {
  const { diary } = useData();
  const scope = useDiaryScope(true);
  const writable = useWritableDiaries();
  const [run, setRun] = useState<TemplateState | null>(null);
  const writableKey = writable.status === 'ok' ? writable.data.map((d) => d.id).join() : null;
  const query = useQuery<Group[]>(async () => {
    if (writable.status !== 'ok') return [];
    const [all, entries, versions] = await Promise.all([diary.listAllTemplates(), diary.listAllEntries(), diary.listAllTemplateVersions()]);
    const states = (await Promise.all(all.map((x) => diary.getTemplate(x.id)))).filter((s): s is TemplateState => s !== undefined);
    return writable.data
      .filter((d) => !scope.diaryId || d.id === scope.diaryId)
      .map((d) => {
        const mine = states.filter((s) => s.template.diaryId === d.id);
        const ids = new Set(mine.map((s) => s.template.id));
        const sel = trainingTemplatesFor(mine, entries.filter((e) => e.diaryId === d.id), versions.filter((v) => ids.has(v.templateId)));
        return { diaryId: d.id, diaryName: d.name, phase: sel.phase, templates: sel.templates };
      })
      .filter((g) => g.templates.length > 0);
  }, [diary, writableKey, scope.diaryId]);

  if (run) {
    return (
      <>
        <PageHeader title={t.title} back />
        <TrainingRun state={run} onCancel={() => setRun(null)} />
      </>
    );
  }
  const groups = query.status === 'ok' ? query.data : [];
  const any = groups.length > 0;
  return (
    <>
      <PageHeader title={t.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && !any ? (
        <>
          <EmptyState title={t.emptyTitle} hint={t.emptyHint} />
          <Button asChild variant="outline">
            <Link to="/more/templates">{t.toTemplates}</Link>
          </Button>
        </>
      ) : null}
      {groups.map((g) => (
        <section key={g.diaryId} className="flex flex-col gap-3" aria-label={t.templatesLabel} data-testid="training-group">
          {groups.length > 1 ? <h2 className="text-sm font-medium text-muted-foreground">{t.diaryHeading(g.diaryName)}</h2> : null}
          <p data-testid="training-phase" className="text-sm text-muted-foreground">{g.phase === null ? t.phaseNone : t.phase(g.phase)}</p>
          {g.templates.map((s) => (
            <Button
              key={s.template.id} variant="outline" data-testid="training-template" aria-label={t.startAria(s.template.name)}
              className="h-14 justify-start gap-3 text-base" onClick={() => setRun(s)}
            >
              <TemplateIcon icon={s.template.icon} color={s.template.color} className="size-5" />
              <span className="min-w-0 flex-1 truncate text-left">{s.template.name}</span>
              <Play aria-hidden className="text-muted-foreground" />
            </Button>
          ))}
        </section>
      ))}
    </>
  );
}
