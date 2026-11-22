// Onboarding „Mit Konto" (Spec 03/10): Benutzername → Server-Optionen vorladen → Klick ruft `credentials.create`
// synchron auf (iOS-Nutzergeste). Login auf neuem Gerät: Optionen beim Öffnen laden, Klick ruft `credentials.get` synchron.
import { useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { useAuth, type RecoveryStart } from '@/auth/AuthContext';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import type { PendingAccount } from '@/auth/local-account';
import { de } from '@/i18n/de';
import { deSettings } from '@/i18n/lazy/settings';
import { deOnboarding } from '@/i18n/lazy/onboarding';

const USERNAME_RE = /^[\p{L}\p{N}._@+-]{3,64}$/u;

/** `upgrade`: bestehendes lokales Konto auf „Mit Konto" umstellen (SYN-11) — gleicher Ablauf, UMK bleibt. */
export function CloudRegister({ onPending, mode = 'register' }: { onPending: (p: PendingAccount) => void; mode?: 'register' | 'upgrade' }) {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [prepared, setPrepared] = useState<{ challengeId: string; options: CredentialCreationOptions } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function loadOptions(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!USERNAME_RE.test(name)) return setFormError(deOnboarding.usernameInvalid);
    setFormError(null);
    setError(null);
    setBusy(true);
    try {
      setPrepared(await auth.cloud.registrationOptions(name));
    } catch (err) {
      if ((err as { code?: string }).code === 'username-taken') setFormError(deOnboarding.usernameTaken);
      else setError(toAuthErrorCode(err));
    } finally {
      setBusy(false);
    }
  }

  function createPasskey() {
    if (!prepared) return;
    // Synchron im Klick — kein `await` davor.
    const pending = auth.credentials.create(prepared.options);
    setBusy(true);
    setError(null);
    pending
      .then(async (credential) => {
        if (!credential) throw new DOMException('abgebrochen', 'NotAllowedError');
        const input = { challengeId: prepared.challengeId, username: username.trim(), credential };
        onPending(await (mode === 'upgrade' ? auth.cloud.prepareUpgrade(input) : auth.cloud.prepareRegistration(input)));
      })
      .catch((err: unknown) => {
        setError(toAuthErrorCode(err, { gesture: true }));
        setPrepared(null); // Challenge ist verbraucht oder abgelaufen → neu anfordern
      })
      .finally(() => setBusy(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'upgrade' ? deSettings.upgradeTitle : deOnboarding.cloudTitle}</CardTitle>
        <CardDescription>{mode === 'upgrade' ? deSettings.upgradeHint : deOnboarding.cloudHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!prepared ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => void loadOptions(e)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cloud-username">{deOnboarding.username}</Label>
              <Input id="cloud-username" autoComplete="username webauthn" value={username} aria-invalid={formError !== null} onChange={(e) => setUsername(e.target.value)} />
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? deOnboarding.working : deOnboarding.next}
            </Button>
          </form>
        ) : (
          <Button onClick={createPasskey} disabled={busy}>
            <Fingerprint aria-hidden />
            {busy ? deOnboarding.working : deOnboarding.createPasskey}
          </Button>
        )}
        {error ? <AuthErrorNotice code={error} /> : null}
      </CardContent>
    </Card>
  );
}

export function CloudLogin({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const [prepared, setPrepared] = useState<{ challengeId: string; options: CredentialRequestOptions } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  // Optionen beim Öffnen vorladen (und nach jedem Fehlversuch neu — Challenges sind einmalig).
  useEffect(() => {
    let cancelled = false;
    auth.cloud.loginOptions().then(
      (p) => !cancelled && setPrepared(p),
      (err: unknown) => !cancelled && setError(toAuthErrorCode(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [auth.cloud, attempt]);

  function login() {
    if (!prepared) return;
    const pending = auth.credentials.get(prepared.options);
    setBusy(true);
    setError(null);
    pending
      .then(async (credential) => {
        if (!credential) throw new DOMException('abgebrochen', 'NotAllowedError');
        await auth.cloud.loginNewDevice({ challengeId: prepared.challengeId, credential });
        onDone();
      })
      .catch((err: unknown) => {
        setError(toAuthErrorCode(err, { gesture: true, factor: 'passkey' }));
        setPrepared(null);
        setAttempt((a) => a + 1);
      })
      .finally(() => setBusy(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{deOnboarding.loginTitle}</CardTitle>
        <CardDescription>{deOnboarding.loginHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={login} disabled={busy || !prepared}>
          <LogIn aria-hidden />
          {busy ? deOnboarding.working : deOnboarding.loginPasskey}
        </Button>
        {error ? <AuthErrorNotice code={error} /> : null}
      </CardContent>
    </Card>
  );
}

/** Gerät hinzufügen per Backup-Code (Spec 03; A-023): Benutzername + Code → neuer Passkey dieses Geräts → neuer Code. */
export function CloudRecovery({ onPending }: { onPending: (p: PendingAccount) => void }) {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [start, setStart] = useState<RecoveryStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function check(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setStart(await auth.cloud.recoveryOptions({ username: username.trim(), backupCode: code }));
    } catch (err) {
      setError(toAuthErrorCode(err, { factor: 'backup' }));
    } finally {
      setBusy(false);
    }
  }

  function createPasskey() {
    if (!start) return;
    const pending = auth.credentials.create(start.options); // synchron im Klick
    setBusy(true);
    setError(null);
    pending
      .then(async (credential) => {
        if (!credential) throw new DOMException('abgebrochen', 'NotAllowedError');
        onPending(await auth.cloud.prepareRecovery({ start, credential }));
      })
      .catch((err: unknown) => {
        setError(toAuthErrorCode(err, { gesture: true }));
        setStart(null);
      })
      .finally(() => setBusy(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{deOnboarding.recoveryTitle}</CardTitle>
        <CardDescription>{deOnboarding.recoveryHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!start ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => void check(e)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recovery-username">{deOnboarding.username}</Label>
              <Input id="recovery-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recovery-code">{de.lock.recoveryCodeLabel}</Label>
              <Input id="recovery-code" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy || !username.trim() || !code.trim()}>
              {busy ? deOnboarding.working : deOnboarding.next}
            </Button>
          </form>
        ) : (
          <Button onClick={createPasskey} disabled={busy}>
            <Fingerprint aria-hidden />
            {busy ? deOnboarding.working : deOnboarding.createDevicePasskey}
          </Button>
        )}
        {error ? <AuthErrorNotice code={error} /> : null}
      </CardContent>
    </Card>
  );
}

/** Kleiner Umschalter unter dem Login: zur Anmeldung per Backup-Code. */
export function RecoveryLink({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="link" onClick={onClick}>
      <KeyRound aria-hidden />
      {deOnboarding.useBackupCode}
    </Button>
  );
}

