// Faktor wählen und anlegen: Passkey (PRF) oder Passwort (Spec 03 „Einrichtung (local-only)"). Liefert den Faktor an den Aufrufer.
import { useState, type FormEvent } from 'react';
import { KeyRound, Fingerprint } from 'lucide-react';
import type { UmkFactor } from '@stb/crypto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { createPasskey } from '@/auth/passkey';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import { useAuth } from '@/auth/AuthContext';
import { de } from '@/i18n/de';

export type NewFactor = { factor: Exclude<UmkFactor, { kind: 'backup' }>; credentialId?: string };

export function FactorSetup({ title, onFactor }: { title: string; onFactor: (f: NewFactor) => Promise<void> }) {
  const { credentials, rpId } = useAuth();
  const [mode, setMode] = useState<'choose' | 'password'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  async function withPasskey() {
    setBusy(true);
    setError(null);
    try {
      const userId = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const { credentialId, prf } = await createPasskey(credentials, { rpId, rpName: de.app.name, userName: de.app.name, userId });
      await onFactor({ factor: { kind: 'passkey', prf }, credentialId });
    } catch (e) {
      setError(toAuthErrorCode(e, { gesture: true }));
    } finally {
      setBusy(false);
    }
  }

  async function withPassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setFormError(de.onboarding.passwordTooShort);
    if (pw !== pw2) return setFormError(de.onboarding.passwordMismatch);
    setFormError(null);
    setBusy(true);
    try {
      await onFactor({ factor: { kind: 'password', password: pw } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <AuthErrorNotice code={error} /> : null}
        {mode === 'choose' ? (
          <>
            <Button disabled={busy} onClick={() => void withPasskey()}>
              <Fingerprint aria-hidden />
              {busy ? de.onboarding.working : de.onboarding.factorPasskey}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setMode('password')}>
              <KeyRound aria-hidden />
              {de.onboarding.factorPassword}
            </Button>
          </>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => void withPassword(e)}>
            <Label htmlFor="pw" className="flex-col items-start">
              {de.onboarding.passwordLabel}
              <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Label>
            <Label htmlFor="pw2" className="flex-col items-start">
              {de.onboarding.passwordRepeat}
              <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Label>
            {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? de.onboarding.working : de.onboarding.create}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
