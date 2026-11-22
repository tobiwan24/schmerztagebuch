// Einstellungen → Gefahr-Zone (UI-21): alle Daten auf diesem Gerät löschen, nach doppelter Bestätigung.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/auth/AuthContext';
import { WIPE_CONFIRM_WORD, wipeLocalData } from '@/auth/wipe';
import { deDanger } from '@/i18n/lazy/danger';

const t = deDanger;

export function DangerZone() {
  const { db, session, accountMode } = useAuth();
  const [step, setStep] = useState<0 | 1>(0);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function wipe() {
    setBusy(true);
    setFailed(false);
    try {
      await wipeLocalData(db, session);
      window.location.replace('/');
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Card data-testid="danger-zone" className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.hint}</p>
        {accountMode === 'cloud-primary' ? <p className="text-sm text-muted-foreground">{t.serverStays}</p> : null}
        {failed ? <p role="alert" className="text-sm text-destructive">{t.failed}</p> : null}
        {step === 0 ? (
          <Button variant="outline" onClick={() => setStep(1)}>{t.start}</Button>
        ) : (
          <div className="flex flex-col gap-3">
            <Label htmlFor="wipe-word">{t.typeWord(WIPE_CONFIRM_WORD)}</Label>
            <Input id="wipe-word" value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy || word !== WIPE_CONFIRM_WORD} onClick={() => void wipe()}>{t.confirm}</Button>
              <Button variant="outline" disabled={busy} onClick={() => { setStep(0); setWord(''); }}>{t.cancel}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
