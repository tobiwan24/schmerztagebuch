// Onboarding (Spec 10): Install-Hinweis → Modus → Faktor → Backup-Code (Pflicht) → erstes Tagebuch → Wetter-Ort (optional) → Vorlage.
// Ein entsperrtes Konto ohne Tagebuch landet hier direkt beim Tagebuch-Schritt (z. B. App nach dem Backup-Code geschlossen).
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Cloud, Smartphone } from 'lucide-react';
import { createDiary, instantiateCatalogTemplate, keyBetween } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UpdateModeToggle } from '@/components/UpdateSettings';
import { PageHeader } from '@/components/PageHeader';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { FactorSetup, type NewFactor } from '@/components/FactorSetup';
import { DiaryStep, LocationStep, TemplateStep, type DiaryChoice } from '@/components/DiarySetup';
import { CloudLogin, CloudRecovery, CloudRegister, RecoveryLink } from '@/components/CloudSetup';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { useSync } from '@/data/SyncContext';
import { requestPersistentStorage } from '@/lib/install';
import { prepareLocalAccount, type PendingAccount } from '@/auth/local-account';
import { useAuth } from '@/auth/AuthContext';
import { de } from '@/i18n/de';
import { SETUP_STEPS, enterSetup, type Step } from './onboarding-steps';


export function OnboardingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('install');
  const [pending, setPending] = useState<PendingAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [diaryChoice, setDiaryChoice] = useState<DiaryChoice | null>(null);
  const [setupError, setSetupError] = useState<AuthErrorCode | null>(null);
  const data = useData();
  const sync = useSync();
  const unlocked = auth.status === 'unlocked';
  const diaries = useQuery(() => (unlocked ? data.diary.listDiaries() : Promise.resolve([])), [data.diary, unlocked]);

  if (auth.status === 'locked') return <Navigate to="/" replace />;
  // Nach dem Login auf einem neuen Gerät erst die Daten holen — sonst würde ein zweites „erstes Tagebuch" angelegt.
  if (unlocked && auth.accountMode === 'cloud-primary' && (!sync.ready || diaries.status !== 'ok')) {
    return <p className="p-4 text-muted-foreground">{de.sync.loadingAfterLogin}</p>;
  }
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
      setStep(enterSetup);
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
      setSetupError(null);
      // Konto „Mit Konto": erst auf dem Server anlegen (DK-Wrap), dann lokal — sonst gäbe es ein nicht synchronisierbares Tagebuch.
      await auth.cloud.createDiary(diary.id);
      await data.diary.createDiary(diary, template);
      // Abschluss des Onboardings: dauerhaften Speicher anfordern (UI-16); das Ergebnis zeigen die Einstellungen.
      await requestPersistentStorage();
      void navigate('/', { replace: true });
    } catch (e) {
      setSetupError(toAuthErrorCode(e));
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
          <div className="flex flex-col gap-4 px-5">
            <UpdateModeToggle />
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
          <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => setStep('cloud')}>
            <Cloud aria-hidden />
            <span className="flex flex-col whitespace-normal">
              <span>{de.onboarding.modeCloud}</span>
              <span className="text-xs text-muted-foreground">{de.onboarding.modeCloudHint}</span>
            </span>
          </Button>
        </>
      ) : null}
      {current === 'factor' ? <FactorSetup title={de.onboarding.factorTitle} onFactor={onFactor} /> : null}
      {current === 'cloud' ? (
        <>
          <CloudRegister onPending={(p) => (setPending(p), setStep('backup'))} />
          <Button variant="link" onClick={() => setStep('cloud-login')}>
            {de.onboarding.haveAccount}
          </Button>
        </>
      ) : null}
      {current === 'cloud-login' ? (
        <>
          <CloudLogin onDone={() => setStep(enterSetup)} />
          <RecoveryLink onClick={() => setStep('cloud-recovery')} />
        </>
      ) : null}
      {current === 'cloud-recovery' ? <CloudRecovery onPending={(p) => (setPending(p), setStep('backup'))} /> : null}
      {current === 'backup' && pending ? <BackupCodeStep code={pending.backupCode} busy={busy} onConfirmed={() => void onConfirmed()} /> : null}
      {current === 'diary' ? <DiaryStep onNext={(c) => (setDiaryChoice(c), setStep('location'))} /> : null}
      {current === 'location' ? <LocationStep onDone={(location) => (setDiaryChoice((c) => (c ? { ...c, ...(location ? { location } : {}) } : c)), setStep('template'))} /> : null}
      {current === 'template' ? <TemplateStep busy={busy} onDone={(id) => void onTemplate(id)} /> : null}
      {setupError ? <AuthErrorNotice code={setupError} /> : null}
    </main>
  );
}
