// Onboarding (Spec 10): Install-Hinweis → Modus → Faktor → Backup-Code (Pflicht). Tagebuch + Vorlage folgen in M8.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Cloud, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { FactorSetup, type NewFactor } from '@/components/FactorSetup';
import { prepareLocalAccount, type PendingAccount } from '@/auth/local-account';
import { useAuth } from '@/auth/AuthContext';
import { de } from '@/i18n/de';

type Step = 'install' | 'mode' | 'factor' | 'backup';

export function OnboardingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('install');
  const [pending, setPending] = useState<PendingAccount | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === 'locked' || auth.status === 'unlocked') return <Navigate to="/" replace />;

  async function onFactor({ factor, credentialId }: NewFactor) {
    setPending(await prepareLocalAccount(auth.db, { factor, now: auth.now, ...(credentialId ? { credentialId } : {}) }));
    setStep('backup');
  }

  async function onConfirmed() {
    if (!pending) return;
    setBusy(true);
    try {
      await auth.finishPending(pending);
      void navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <PageHeader title={de.app.name} />
      {step === 'install' ? (
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
      {step === 'mode' ? (
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
      {step === 'factor' ? <FactorSetup title={de.onboarding.factorTitle} onFactor={onFactor} /> : null}
      {step === 'backup' && pending ? <BackupCodeStep code={pending.backupCode} busy={busy} onConfirmed={() => void onConfirmed()} /> : null}
    </main>
  );
}
