// Einstellungen → Sicherheit: Zugang verwalten (Spec 03, CRY-18; local-only). Jede Änderung verlangt zuerst das aktuelle
// Passwort (falls es einen Passwort-Faktor gibt); danach wird gewechselt. Der Passkey wird in einem eigenen Klick angelegt
// (iOS: `credentials.create` muss aus der Nutzergeste kommen).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { BackupCodeStep } from '@/components/BackupCodeStep';
import { useAuth } from '@/auth/AuthContext';
import { addPasskey, factorInfo, prepareBackupCodeRenewal, removePasskey, setPassword, unlockLocal, type PendingBackupCode } from '@/auth/local-account';
import { createPasskey } from '@/auth/passkey';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import { refreshAutoBackupWraps } from '@/data/auto-backup-store';
import { de } from '@/i18n/de';

const t = de.factors;
type Action = 'password' | 'passkey-add' | 'passkey-remove' | 'backup';

export function FactorsSection() {
  const { db, session, credentials, rpId } = useAuth();
  const [info, setInfo] = useState<{ hasPassword: boolean; hasPasskey: boolean } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [verified, setVerified] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pending, setPending] = useState<PendingBackupCode | null>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const i = await factorInfo(db);
    setInfo(i ? { hasPassword: i.hasPassword, hasPasskey: i.hasPasskey } : null);
  }, [db]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (!info) return null;

  function reset() {
    setAction(null);
    setVerified(false);
    setCurrent('');
    setNext('');
    setRepeat('');
    setPending(null);
    setError(null);
    setFormError(null);
  }

  async function finish(message: string, wraps: Parameters<typeof refreshAutoBackupWraps>[0]) {
    await refreshAutoBackupWraps(wraps);
    reset();
    setDone(message);
    await reload();
  }

  async function begin(a: Action) {
    reset();
    setDone(null);
    setAction(a);
    if (!info!.hasPassword) await afterVerified(a);
  }

  async function afterVerified(a: Action) {
    setVerified(true);
    if (a === 'backup') {
      try {
        setPending(await prepareBackupCodeRenewal(db, session.umk()));
      } catch (e) {
        setError(toAuthErrorCode(e));
      }
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await unlockLocal(db, { kind: 'password', password: current });
      await afterVerified(action);
    } catch (err) {
      setError(toAuthErrorCode(err, { factor: 'password' }));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setFormError(de.onboarding.passwordTooShort);
    if (next !== repeat) return setFormError(de.onboarding.passwordMismatch);
    setFormError(null);
    setBusy(true);
    try {
      await finish(t.passwordDone, await setPassword(db, session.umk(), next));
    } catch (err) {
      setError(toAuthErrorCode(err));
    } finally {
      setBusy(false);
    }
  }

  async function createNewPasskey() {
    setBusy(true);
    setError(null);
    try {
      const userId = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const { credentialId, prf } = await createPasskey(credentials, { rpId, rpName: de.app.name, userName: de.app.name, userId });
      await finish(t.passkeyAdded, await addPasskey(db, session.umk(), { prf, credentialId }));
    } catch (err) {
      setError(toAuthErrorCode(err, { gesture: true }));
    } finally {
      setBusy(false);
    }
  }

  async function dropPasskey() {
    setBusy(true);
    setError(null);
    try {
      await finish(t.passkeyRemoved, await removePasskey(db));
    } catch (err) {
      setError(toAuthErrorCode(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBackupCode() {
    if (!pending) return;
    setBusy(true);
    try {
      await finish(t.backupDone, await pending.commit());
    } catch (err) {
      setError(toAuthErrorCode(err));
    } finally {
      setBusy(false);
    }
  }

  // Neuer Backup-Code: Pflichtbestätigung wie im Onboarding (CRY-08)
  if (pending) return <BackupCodeStep code={pending.backupCode} busy={busy} onConfirmed={() => void confirmBackupCode()} />;

  const gate = action !== null && !verified && info.hasPassword;
  return (
    <div className="flex flex-col gap-3" data-testid="factors">
      <p className="text-sm font-medium">{t.title}</p>
      {done ? <p role="status" data-testid="factors-done" className="text-sm text-muted-foreground">{done}</p> : null}
      {error ? <AuthErrorNotice code={error} /> : null}

      {gate ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => void verify(e)}>
          <Label htmlFor="factor-current" className="flex-col items-start">
            {t.currentPassword}
            <Input id="factor-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !current}>{busy ? de.onboarding.working : t.confirm}</Button>
            <Button type="button" variant="outline" onClick={reset}>{de.lock.cancel}</Button>
          </div>
        </form>
      ) : null}

      {action === 'password' && verified ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => void savePassword(e)}>
          <Label htmlFor="factor-new" className="flex-col items-start">
            {t.newPassword}
            <Input id="factor-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Label>
          <Label htmlFor="factor-repeat" className="flex-col items-start">
            {t.newPasswordRepeat}
            <Input id="factor-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Label>
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? de.onboarding.working : t.save}</Button>
            <Button type="button" variant="outline" onClick={reset}>{de.lock.cancel}</Button>
          </div>
        </form>
      ) : null}

      {action === 'passkey-add' && verified ? (
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => void createNewPasskey()}>
            <Fingerprint aria-hidden />
            {busy ? de.onboarding.working : t.passkeyCreate}
          </Button>
          <Button variant="outline" onClick={reset}>{de.lock.cancel}</Button>
        </div>
      ) : null}

      {action === 'passkey-remove' && verified ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t.passkeyRemoveHint}</p>
          <div className="flex gap-2">
            <Button variant="destructive" disabled={busy} onClick={() => void dropPasskey()}>{t.passkeyRemoveConfirm}</Button>
            <Button variant="outline" onClick={reset}>{de.lock.cancel}</Button>
          </div>
        </div>
      ) : null}

      {action === null ? (
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => void begin('password')}>
            <KeyRound aria-hidden />
            {info.hasPassword ? t.passwordChange : t.passwordSet}
          </Button>
          {info.hasPasskey ? (
            <>
              <Button variant="outline" disabled={!info.hasPassword} onClick={() => void begin('passkey-remove')}>
                <Fingerprint aria-hidden />
                {t.passkeyRemove}
              </Button>
              {!info.hasPassword ? <p className="text-xs text-muted-foreground">{t.passkeyLastFactor}</p> : null}
            </>
          ) : (
            <Button variant="outline" onClick={() => void begin('passkey-add')}>
              <Fingerprint aria-hidden />
              {t.passkeyAdd}
            </Button>
          )}
          <Button variant="outline" onClick={() => void begin('backup')}>
            <RefreshCw aria-hidden />
            {t.backupRenew}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
