// Entsperren (Spec 03): Passkey-Optionen werden beim Öffnen vorbereitet, der Klick ruft `credentials.get` ohne `await` davor.
// Abbrechen führt zurück — der Dialog bleibt über Banner und Einstellungen erreichbar (CRY-10). Recovery per Backup-Code (CRY-16).
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Fingerprint, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { FactorSetup, type NewFactor } from '@/components/FactorSetup';
import { useAuth } from '@/auth/AuthContext';
import { unlockWithPasskey } from '@/auth/passkey';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import { prepareRecovery, type PendingAccount } from '@/auth/local-account';
import { de } from '@/i18n/de';

type Mode = 'unlock' | 'recovery-code' | 'recovery-factor' | 'recovery-backup';

export function UnlockPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [prepared, setPrepared] = useState<CredentialRequestOptions | null>(null);
  const [mode, setMode] = useState<Mode>('unlock');
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [stay, setStay] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<PendingAccount | null>(null);
  const [hasPassword, setHasPassword] = useState(false);

  // Beim Öffnen einmal vorbereiten. Abhängig nur von der (stabilen) DB — `auth` selbst ist pro Render neu.
  const { passkeyRequest, hasPasswordFactor, db } = auth;
  useEffect(() => {
    let cancelled = false;
    void passkeyRequest().then((p) => {
      if (!cancelled) setPrepared(p);
    });
    void hasPasswordFactor().then((h) => {
      if (!cancelled) setHasPassword(h);
    });
    return () => {
      cancelled = true;
    };
  }, [db, passkeyRequest, hasPasswordFactor]);

  if (auth.status === 'no-account') return <Navigate to="/onboarding" replace />;
  if (auth.status === 'unlocked' && mode === 'unlock') return <Navigate to={next} replace />;

  function onPasskeyClick() {
    if (!prepared) return;
    // Keine awaits vor diesem Aufruf (iOS-Nutzergeste).
    const prf = unlockWithPasskey(auth.credentials, prepared);
    setBusy(true);
    setError(null);
    prf
      .then((p) => auth.unlockWith({ kind: 'passkey', prf: p }, { stayUnlocked: stay }))
      .catch((e: unknown) => setError(toAuthErrorCode(e, { gesture: true, factor: 'passkey' })))
      .finally(() => setBusy(false));
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.unlockWith({ kind: 'password', password }, { stayUnlocked: stay });
    } catch (err) {
      setError(toAuthErrorCode(err, { factor: 'password' }));
    } finally {
      setBusy(false);
    }
  }

  async function onRecoveryCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMode('recovery-factor');
  }

  async function onNewFactor({ factor, credentialId }: NewFactor) {
    try {
      setPending(await prepareRecovery(auth.db, { backupCode: code, newFactor: factor, ...(credentialId ? { credentialId } : {}) }));
      setMode('recovery-backup');
    } catch (err) {
      setError(toAuthErrorCode(err, { factor: 'backup' }));
      setMode('recovery-code');
    }
  }

  async function onRecoveryConfirmed() {
    if (!pending) return;
    setBusy(true);
    try {
      await auth.finishPending(pending);
      void navigate(next, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <PageHeader title={mode === 'unlock' ? de.lock.unlockTitle : de.lock.recoveryTitle} />
      {error ? <AuthErrorNotice code={error} /> : null}
      {mode === 'unlock' ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {prepared ? (
              <Button disabled={busy} onClick={onPasskeyClick}>
                <Fingerprint aria-hidden />
                {de.lock.unlockPasskey}
              </Button>
            ) : null}
            {/* Passwort, wenn das Konto einen Passwort-Faktor hat (oder als Fallback ohne Passkey). */}
            {hasPassword || !prepared ? (
              <form className="flex flex-col gap-3" onSubmit={(e) => void onPassword(e)}>
                <Label htmlFor="unlock-pw" className="flex-col items-start">
                  {de.lock.passwordLabel}
                  <Input id="unlock-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Label>
                <Button type="submit" disabled={busy}>
                  {de.lock.unlockPassword}
                </Button>
              </form>
            ) : null}
            <Label className="min-h-11">
              <Checkbox checked={stay} onChange={(e) => setStay(e.target.checked)} />
              {de.lock.stayUnlocked}
            </Label>
            <Button variant="ghost" onClick={() => setMode('recovery-code')}>
              <LifeBuoy aria-hidden />
              {de.lock.useBackupCode}
            </Button>
            <Button variant="outline" onClick={() => void navigate(next === '/unlock' ? '/' : next, { replace: true })}>
              {de.lock.cancel}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {mode === 'recovery-code' ? (
        <Card>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={(e) => void onRecoveryCode(e)}>
              <Label htmlFor="recovery-code" className="flex-col items-start">
                {de.lock.recoveryCodeLabel}
                <Input id="recovery-code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
              </Label>
              <Button type="submit" disabled={!code.trim()}>
                {de.lock.recoveryNext}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode('unlock')}>
                {de.lock.cancel}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {mode === 'recovery-factor' ? (
        <>
          <p className="text-sm text-muted-foreground">{de.lock.recoveryNewFactor}</p>
          <FactorSetup title={de.onboarding.factorTitle} onFactor={onNewFactor} />
        </>
      ) : null}
      {mode === 'recovery-backup' && pending ? (
        <BackupCodeStep code={pending.backupCode} busy={busy} onConfirmed={() => void onRecoveryConfirmed()} />
      ) : null}
    </main>
  );
}
