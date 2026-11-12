// Onboarding „Mit Konto" (Spec 03/10): Benutzername → Server-Optionen vorladen → Klick ruft `credentials.create`
// synchron auf (iOS-Nutzergeste). Login auf neuem Gerät: Optionen beim Öffnen laden, Klick ruft `credentials.get` synchron.
import { useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { useAuth } from '@/auth/AuthContext';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import type { PendingAccount } from '@/auth/local-account';
import { de } from '@/i18n/de';

const USERNAME_RE = /^[\p{L}\p{N}._@+-]{3,64}$/u;

export function CloudRegister({ onPending }: { onPending: (p: PendingAccount) => void }) {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [prepared, setPrepared] = useState<{ challengeId: string; options: CredentialCreationOptions } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function loadOptions(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!USERNAME_RE.test(name)) return setFormError(de.onboarding.usernameInvalid);
    setFormError(null);
    setError(null);
    setBusy(true);
    try {
      setPrepared(await auth.cloud.registrationOptions(name));
    } catch (err) {
      if ((err as { code?: string }).code === 'username-taken') setFormError(de.onboarding.usernameTaken);
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
        onPending(await auth.cloud.prepareRegistration({ challengeId: prepared.challengeId, username: username.trim(), credential }));
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
        <CardTitle>{de.onboarding.cloudTitle}</CardTitle>
        <CardDescription>{de.onboarding.cloudHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!prepared ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => void loadOptions(e)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cloud-username">{de.onboarding.username}</Label>
              <Input id="cloud-username" autoComplete="username webauthn" value={username} aria-invalid={formError !== null} onChange={(e) => setUsername(e.target.value)} />
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? de.onboarding.working : de.onboarding.next}
            </Button>
          </form>
        ) : (
          <Button onClick={createPasskey} disabled={busy}>
            <Fingerprint aria-hidden />
            {busy ? de.onboarding.working : de.onboarding.createPasskey}
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
        <CardTitle>{de.onboarding.loginTitle}</CardTitle>
        <CardDescription>{de.onboarding.loginHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={login} disabled={busy || !prepared}>
          <LogIn aria-hidden />
          {busy ? de.onboarding.working : de.onboarding.loginPasskey}
        </Button>
        {error ? <AuthErrorNotice code={error} /> : null}
      </CardContent>
    </Card>
  );
}
