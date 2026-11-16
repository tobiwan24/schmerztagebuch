import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { V2DataCard } from '@/components/V2DataCard';
import { ReminderCard } from '@/components/ReminderCard';
import { useAuth } from '@/auth/AuthContext';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { CloudRegister } from '@/components/CloudSetup';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { LockSettingsCard } from '@/components/LockSettingsCard';
import { CloudAccountCard } from '@/components/CloudAccountCard';
import { DevicesSection } from '@/components/DevicesSection';
import { DangerZone } from '@/components/DangerZone';
import { FactorsSection } from '@/components/FactorsSection';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import type { PendingAccount } from '@/auth/local-account';
import { setTheme, storedTheme, type ThemeChoice } from '@/theme';
import { de } from '@/i18n/de';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: de.settings.themeLight, Icon: Sun },
  { value: 'dark', label: de.settings.themeDark, Icon: Moon },
  { value: 'system', label: de.settings.themeSystem, Icon: Monitor },
];

export function SettingsPage() {
  const [theme, setThemeState] = useState<ThemeChoice>(storedTheme);
  const auth = useAuth();
  return (
    <>
      <PageHeader title={de.settings.title} back />
      <Card>
        <CardHeader>
          <CardTitle>{de.settings.security}</CardTitle>
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
          {auth.status === 'unlocked' && auth.accountMode !== null ? <FactorsSection /> : null}
        </CardContent>
      </Card>
      {auth.status === 'unlocked' ? <LockSettingsCard /> : null}
      {auth.status === 'unlocked' && auth.accountMode === 'local-only' ? <UpgradeToCloud /> : null}
      {auth.accountMode === 'cloud-primary' ? <CloudAccountCard /> : null}
      {auth.status === 'unlocked' && auth.syncAttached ? <DevicesSection /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{de.settings.appearance}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2" role="group" aria-label={de.settings.appearance}>
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
      <ReminderCard />
      <V2DataCard />
      <Button asChild variant="outline">
        <Link to="/more/settings/konflikte">{de.conflicts.open}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/more/settings/diagnose">{de.diagnostics.open}</Link>
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
        <CardTitle>{de.settings.account}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{de.settings.localOnly}</p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {de.settings.upgradeAction}
        </Button>
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
  const t = de.install;
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
