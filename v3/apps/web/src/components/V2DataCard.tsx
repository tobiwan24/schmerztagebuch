// Einstellungen → v2-Daten (Spec 11, Schritt 8): Assistent öffnen; „v2-Daten von diesem Gerät entfernen" erst nach
// erfolgreicher Prüfung und nur mit Bestätigung (MIG-14).
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useRemoveV2, useV2Status } from '@/migration/status';
import { deMigration } from '@/i18n/lazy/migration';

const t = deMigration;

export function V2DataCard() {
  const status = useV2Status();
  const remove = useRemoveV2();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (status.status !== 'ok') return null;
  const { counts, state } = status.data;
  if (!counts && !state?.v2RemovedAt) return null; // nur Geräte mit lokaler v2-Datenbank (oder nach Entfernen hier)

  const verified = !!state?.verify.ok && !!state.migratedFromV2At;
  const removed = !!state?.v2RemovedAt;
  async function doRemove() {
    setBusy(true);
    setError(false);
    try {
      await remove();
      setConfirming(false);
      status.retry();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="v2-data-card">
      <CardHeader>
        <CardTitle>{t.settingsTitle}</CardTitle>
        <CardDescription data-testid="v2-data-status">
          {removed ? t.settingsRemoved : verified ? t.settingsMigrated(new Date(state!.migratedFromV2At!).toLocaleDateString('de-DE')) : t.settingsNotMigrated}
        </CardDescription>
      </CardHeader>
      {!removed ? (
        <CardContent className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <Link to="/migrate">{t.settingsOpen}</Link>
          </Button>
          <Button variant="destructive" disabled={!verified} onClick={() => setConfirming(true)}>
            {t.remove}
          </Button>
          {!verified ? <p className="text-xs text-muted-foreground">{t.removeHint}</p> : null}
        </CardContent>
      ) : null}
      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby="remove-v2-title">
        <DialogTitle id="remove-v2-title">{t.removeTitle}</DialogTitle>
        <DialogDescription>{t.removeText}</DialogDescription>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {t.error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(false)}>
            {t.cancel}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void doRemove()}>
            {t.removeConfirm}
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

/** Hinweis auf der Startseite, solange v2-Daten auf dem Gerät liegen und noch nicht übernommen sind (Spec 10). */
export function V2Banner() {
  const status = useV2Status();
  if (status.status !== 'ok' || !status.data.counts || status.data.state?.migratedFromV2At || status.data.counts.entries === 0) return null;
  return (
    <Card data-testid="v2-banner">
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-sm">{t.startBanner}</p>
        <Button asChild size="sm">
          <Link to="/migrate">{t.startBannerAction}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
