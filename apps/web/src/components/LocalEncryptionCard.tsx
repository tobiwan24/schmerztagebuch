// Einstellungen → „Daten auf dem Gerät verschlüsseln“ (Spec 02, DM-18): Schalter mit Bestätigungsdialog (endgültig) und
// Fortschritt der Hintergrund-Umstellung.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useLocalEncryption } from '@/data/LocalEncryptionContext';
import { deLocalEncryption as t } from '@/i18n/lazy/localEncryption';

export function LocalEncryptionCard() {
  const enc = useLocalEncryption();
  const [confirm, setConfirm] = useState(false);
  const done = Math.max(0, enc.total - enc.remaining);
  return (
    <Card data-testid="local-encryption">
      <CardHeader>
        <CardTitle>{t.heading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        <Label className="min-h-11 gap-3">
          <Checkbox checked={enc.enabled} disabled={enc.enabled} onChange={() => setConfirm(true)} />
          {t.label}
        </Label>
        <p className="text-sm text-muted-foreground">{enc.enabled ? t.on : t.hint}</p>
        {enc.enabled ? (
          <div role="status" className="flex flex-col gap-2 text-sm" data-testid="local-encryption-status">
            {enc.running ? (
              <>
                <p>{t.running(done, enc.total)}</p>
                <Progress value={done} max={Math.max(enc.total, 1)} aria-label={t.progressLabel} />
              </>
            ) : enc.remaining === 0 && enc.completedAt ? (
              <p data-testid="local-encryption-done">{t.done}</p>
            ) : enc.remaining > 0 ? (
              <p>{t.pending(enc.remaining)}</p>
            ) : null}
            {enc.failed > 0 && !enc.running ? <p className="text-destructive">{t.failed(enc.failed)}</p> : null}
          </div>
        ) : null}
        <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="local-enc-title">
          <DialogTitle id="local-enc-title">{t.dialogTitle}</DialogTitle>
          <DialogDescription className="flex flex-col gap-2">
            {t.dialogBody.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>{t.cancel}</Button>
            <Button onClick={() => void enc.enable().then(() => setConfirm(false))}>{t.confirm}</Button>
          </DialogFooter>
        </Dialog>
      </CardContent>
    </Card>
  );
}
