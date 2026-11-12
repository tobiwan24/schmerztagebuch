// Onboarding (Spec 10): Install-Hinweis → Modus → Faktor → Backup-Code (Pflicht) → erstes Tagebuch → Vorlage.
// Ein entsperrtes Konto ohne Tagebuch landet hier direkt beim Tagebuch-Schritt (z. B. App nach dem Backup-Code geschlossen).
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Cloud, Smartphone } from 'lucide-react';
import { createDiary, instantiateCatalogTemplate, keyBetween } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { FactorSetup, type NewFactor } from '@/components/FactorSetup';
import { DiaryStep, TemplateStep, type DiaryChoice } from '@/components/DiarySetup';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { prepareLocalAccount, type PendingAccount } from '@/auth/local-account';
import { useAuth } from '@/auth/AuthContext';
import { de } from '@/i18n/de';

type Step = 'install' | 'mode' | 'factor' | 'backup' | 'diary' | 'template';
const SETUP_STEPS: readonly Step[] = ['diary', 'template'];

export function OnboardingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('install');
  const [pending, setPending] = useState<PendingAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [diaryChoice, setDiaryChoice] = useState<DiaryChoice | null>(null);
  const data = useData();
  const unlocked = auth.status === 'unlocked';
  const diaries = useQuery(() => (unlocked ? data.diary.listDiaries() : Promise.resolve([])), [data, unlocked]);

  if (auth.status === 'locked') return <Navigate to="/" replace />;
  if (unlocked && !busy && diaries.status === 'ok' && diaries.data.length > 0) return <Navigate to="/" replace />;
  const current: Step = unlocked && !SETUP_STEPS.includes(step) ? 'diary' : step;

  async function onFactor({ factor, credentialId }: NewFactor) {
    setPending(await prepareLocalAccount(auth.db, { factor, now: auth.now, ...(credentialId ? { credentialId } : {}) }));
    setStep('backup');
  }

  async function onConfirmed() {
    if (!pending) return;
    setBusy(true);
    try {
      await auth.finishPending(pending);
      setStep('diary');
    } finally {
      setBusy(false);
    }
  }

  async function onTemplate(catalogId: string | null) {
    if (!diaryChoice) return setStep('diary');
    setBusy(true);
    try {
      const clock = { now: auth.now };
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const diary = createDiary({ id: data.newId(), ...diaryChoice, timezone }, clock);
      const template = catalogId
        ? instantiateCatalogTemplate(catalogId, { id: data.newId(), diaryId: diary.id, order: keyBetween(null, null), newId: data.newId }, clock)
        : undefined;
      await data.diary.createDiary(diary, template);
      void navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <PageHeader title={de.app.name} />
      {current === 'install' ? (
        <Card>
          <CardHeader>
            <CardTitle>{de.onboarding.installTitle}</CardTitle>
            <CardDescription>{de.onboarding.installHint}</CardDescription>
          </CardHeader>
          <div className="px-5">
            <Button className="w-full" onClick={() => setStep('mode')}>
              {de.onboarding.installNext}
            </Button>
          </div>
        </Card>
      ) : null}
      {current === 'mode' ? (
        <>
          <h2 className="text-lg font-semibold">{de.onboarding.modeTitle}</h2>
          <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => setStep('factor')}>
            <Smartphone aria-hidden />
            <span className="flex flex-col whitespace-normal">
              <span>{de.onboarding.modeLocal}</span>
              <span className="text-xs text-muted-foreground">{de.onboarding.modeLocalHint}</span>
            </span>
          </Button>
          <Button variant="outline" className="h-auto justify-start py-3 text-left" disabled>
            <Cloud aria-hidden />
            <span className="flex flex-col whitespace-normal">
              <span>{de.onboarding.modeCloud}</span>
              <span className="text-xs text-muted-foreground">{de.onboarding.modeCloudHint}</span>
            </span>
          </Button>
        </>
      ) : null}
      {current === 'factor' ? <FactorSetup title={de.onboarding.factorTitle} onFactor={onFactor} /> : null}
      {current === 'backup' && pending ? <BackupCodeStep code={pending.backupCode} busy={busy} onConfirmed={() => void onConfirmed()} /> : null}
      {current === 'diary' ? <DiaryStep onNext={(c) => (setDiaryChoice(c), setStep('template'))} /> : null}
      {current === 'template' ? <TemplateStep busy={busy} onDone={(id) => void onTemplate(id)} /> : null}
    </main>
  );
}
