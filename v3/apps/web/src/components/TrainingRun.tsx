// Trainingsdurchgang (UI-30): Schritt für Schritt durch die Übungen der Vorlage, am Ende Abschluss mit den übrigen Feldern
// (z. B. Anstrengung/Schmerz). Speichern ergibt einen normalen Eintrag (Zeitpunkt = jetzt).
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  displayValue, initialValues, missingRequired, sortedBlocks, valuesToSave,
  type BlockDef, type Entry, type ExerciseConfig, type ExerciseValue, type FormValues, type TemplateState,
} from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BlockField } from '@/components/blocks/BlockField';
import { ExerciseField } from '@/components/blocks/ExerciseField';
import { TemplateIcon } from '@/components/TemplateIcon';
import { useData } from '@/data/DataContext';
import { de } from '@/i18n/de';

const t = de.training;

export function TrainingRun({ state, onCancel }: { state: TemplateState; onCancel: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const { template, version } = state;
  const blocks = sortedBlocks(version);
  const exercises = blocks.filter((b): b is Extract<BlockDef, { type: 'exercise' }> => b.type === 'exercise');
  const others = blocks.filter((b) => b.type !== 'exercise');
  const [values, setValues] = useState<FormValues>(() => initialValues(version));
  /** 0 … n-1 = Übungen, n = Abschluss. */
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const last = exercises.length;
  const exercise = exercises[step];
  const missing = new Set(showErrors ? missingRequired(version, values) : []);
  const setValue = (id: string, v: unknown) => setValues({ ...values, [id]: v });

  async function save() {
    const miss = missingRequired(version, values);
    if (miss.length) {
      setShowErrors(true);
      // Zum ersten Schritt mit fehlendem Pflichtfeld springen
      const i = exercises.findIndex((b) => miss.includes(b.id));
      setStep(i >= 0 ? i : last);
      return;
    }
    setSaving(true);
    try {
      const s = await data.stamper.stamp();
      const entry: Entry = {
        id: data.newId(), diaryId: template.diaryId, templateId: template.id, templateVersion: version.version,
        occurredAt: s.at, recordedAt: s.at, updatedAt: s.at, authorId: s.authorId, values: valuesToSave(version, values), tags: [],
        meta: { source: 'app', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, hlc: s.hlc,
      };
      await data.diary.saveEntry(entry);
      void navigate(`/entry/${entry.id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" data-testid="training-run" aria-label={template.name}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <TemplateIcon icon={template.icon} color={template.color} />
        {template.name}
      </p>

      {exercise ? (
        <>
          <h2 className="text-lg font-semibold" data-testid="training-step-title">
            {exercise.label}
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="training-step-count">{t.stepOf(step + 1, exercises.length)}</p>
          <ExerciseField
            key={exercise.id} id={`block-${exercise.id}`} guided config={exercise.config as ExerciseConfig}
            value={values[exercise.id] as ExerciseValue | undefined} onChange={(v) => setValue(exercise.id, v)}
          />
          {missing.has(exercise.id) ? <p role="alert" className="text-sm text-destructive">{de.entry.requiredMissing}</p> : null}
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold" data-testid="training-step-title">{t.summaryTitle}</h2>
          <p className="text-sm text-muted-foreground">{exercises.length === 0 ? t.noExercises : t.summaryHint}</p>
          {exercises.length > 0 ? (
            <section className="flex flex-col gap-2" aria-label={t.summaryDone}>
              <h3 className="text-sm font-medium">{t.summaryDone}</h3>
              <Card className="gap-0 py-0">
                {exercises.map((b) => {
                  const v = values[b.id];
                  return (
                    <div key={b.id} data-testid="training-summary-row" className="flex items-start justify-between gap-4 border-b px-4 py-3 last:border-b-0">
                      <span className="text-sm text-muted-foreground">{b.label}</span>
                      <span className="text-right text-sm">{v === undefined ? '–' : displayValue(b, v) || '–'}</span>
                    </div>
                  );
                })}
              </Card>
            </section>
          ) : null}
          {others.map((def) => (
            <BlockField key={def.id} def={def} diaryId={template.diaryId} value={values[def.id]} invalid={missing.has(def.id)} itemId={data.newId} onChange={(v) => setValue(def.id, v)} />
          ))}
          {missing.size > 0 ? <p role="alert" className="text-sm text-destructive">{t.requiredSummary}</p> : null}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
            {t.back}
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
        {step < last ? (
          <Button type="button" className="flex-1" onClick={() => setStep(step + 1)}>
            {t.next}
          </Button>
        ) : (
          <Button type="button" className="flex-1" disabled={saving} onClick={() => void save()}>
            {saving ? t.saving : t.save}
          </Button>
        )}
      </div>
    </section>
  );
}
