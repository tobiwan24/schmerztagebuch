import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { V2DataCard } from '@/components/V2DataCard';
import { ReminderCard } from '@/components/ReminderCard';
import { RulesCard } from '@/components/RulesCard';
import { useAuth } from '@/auth/AuthContext';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { CloudRegister } from '@/components/CloudSetup';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { LockSettingsCard } from '@/components/LockSettingsCard';
import { LocalEncryptionCard } from '@/components/LocalEncryptionCard';
import { CloudAccountCard } from '@/components/CloudAccountCard';
import { DevicesSection } from '@/components/DevicesSection';
import { IntegrationsCard } from '@/components/IntegrationsCard';
import { TourRestartCard } from '@/tour/TourRestartCard';
import { LlmSettingsCard } from '@/components/LlmSettingsCard';
import { UpdateSettingsCard } from '@/components/UpdateSettings';
import { DangerZone } from '@/components/DangerZone';
import { FactorsSection } from '@/components/FactorsSection';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import type { PendingAccount } from '@/auth/local-account';
import { setTheme, storedTheme, type ThemeChoice } from '@/theme';
import { de } from '@/i18n/de';
import { deSettings } from '@/i18n/lazy/settings';
import { deDiagnostics } from '@/i18n/lazy/diagnostics';
import { deInstall } from '@/i18n/lazy/install';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: deSettings.themeLight, Icon: Sun },
  { value: 'dark', label: deSettings.themeDark, Icon: Moon },
  { value: 'system', label: deSettings.themeSystem, Icon: Monitor },
];

export function SettingsPage() {
  const [theme, setThemeState] = useState<ThemeChoice>(storedTheme);
  const auth = useAuth();
  return (
    <>
      <PageHeader title={deSettings.title} back />
      {auth.status === 'unlocked' && auth.accountMode === 'local-only' ? <UpgradeToCloud /> : null}
      {auth.accountMode === 'cloud-primary' ? <CloudAccountCard /> : null}
      <UpdateSettingsCard />
      <Card>
        <CardHeader>
          <CardTitle>{deSettings.security}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {auth.status === 'locked' ? (
            <Button asChild className="w-full">
              <Link to="/unlock?next=%2Fmore%2Fsettings">{de.lock.bannerAction}</Link>
            </Button>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => void auth.lock()}>
              {de.lock.lockNow}
            </Button>
          )}
        </CardContent>
      </Card>
      {auth.status === 'unlocked' ? <LockSettingsCard /> : null}
      {auth.status === 'unlocked' ? <LocalEncryptionCard /> : null}
      {auth.status === 'unlocked' && auth.syncAttached ? <DevicesSection /> : null}
      {auth.status === 'unlocked' && auth.accountMode === 'cloud-primary' && auth.syncAttached ? <IntegrationsCard /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{deSettings.appearance}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2" role="group" aria-label={deSettings.appearance}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <Button
              key={value}
              variant={theme === value ? 'default' : 'outline'}
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value);
                setThemeState(value);
              }}
            >
              <Icon aria-hidden />
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>
      <PersistCard />
      <TourRestartCard />
      <ReminderCard />
      <ReminderCard kind="training" />
      <RulesCard />
      <LlmSettingsCard />
      <V2DataCard />
      <Button asChild variant="outline">
        <Link to="/more/settings/konflikte">{de.conflicts.open}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/more/settings/diagnose">{deDiagnostics.open}</Link>
      </Button>
      {auth.status !== 'loading' && auth.accountMode !== null ? <DangerZone /> : null}
    </>
  );
}

/** Wechsel „nur auf diesem Gerät" → „Mit Konto" (Spec 04, SYN-11): Passkey anlegen, neuen Backup-Code bestätigen, hochladen. */
function UpgradeToCloud() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await auth.finishPending(pending);
    } catch (e) {
      setError(toAuthErrorCode(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  if (pending) return <BackupCodeStep code={pending.backupCode} busy={busy} onConfirmed={() => void confirm()} />;
  if (open) {
    return (
      <>
        <CloudRegister mode="upgrade" onPending={setPending} />
        {error ? <AuthErrorNotice code={error} /> : null}
      </>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{deSettings.account}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{deSettings.localOnly}</p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {deSettings.upgradeAction}
        </Button>
        <FactorsSection />
      </CardContent>
    </Card>
  );
}

/** Status „Dauerhafter Speicher" (UI-16). */
function PersistCard() {
  const [state, setState] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void (async () => {
      const persisted = await navigator.storage?.persisted?.().catch(() => null);
      if (live) setState(persisted ?? null);
    })();
    return () => {
      live = false;
    };
  }, []);
  const t = deInstall;
  return (
    <Card data-testid="persist-card">
      <CardHeader>
        <CardTitle>{t.persistTitle}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {state === undefined ? de.app.loading : state === null ? t.persistUnknown : state ? t.persistGranted : t.persistDenied}
      </CardContent>
    </Card>
  );
}
