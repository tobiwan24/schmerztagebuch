// Einstellungen → Konto & Sync (Konto „Mit Konto“, UI-20): „Jetzt synchronisieren" und Wechsel zurück auf „nur dieses Gerät".
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/auth/AuthContext';
import { useSync } from '@/data/SyncContext';
import { de } from '@/i18n/de';

const t = de.settings;

export function CloudAccountCard() {
  const auth = useAuth();
  const sync = useSync();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ reason: 'outbox-not-empty' | 'server-unreachable'; pending: number } | null>(null);

  async function detach() {
    setBusy(true);
    setBlocked(null);
    try {
      const r = await sync.detach();
      if (r.ok) setConfirm(false);
      else setBlocked({ reason: r.reason, pending: r.pending });
    } catch {
      setBlocked({ reason: 'server-unreachable', pending: 0 });
    } finally {
      setBusy(false);
    }
  }

  if (!auth.syncAttached) {
    return (
      <Card data-testid="account-card">
        <CardHeader>
          <CardTitle>{t.account}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground" data-testid="account-detached">{t.detached}</CardContent>
      </Card>
    );
  }
  return (
    <Card data-testid="account-card">
      <CardHeader>
        <CardTitle>{t.account}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.cloudActive}</p>
        <Button variant="outline" disabled={sync.state === 'syncing'} onClick={() => void sync.syncNow()}>
          {sync.state === 'syncing' ? t.syncRunning : t.syncNow}
        </Button>
        {sync.state === 'synced' ? <p role="status" className="text-sm text-muted-foreground">{t.syncDone}</p> : null}
        {confirm ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t.detachHint}</p>
            {blocked ? (
              <p role="alert" data-testid="detach-blocked" className="text-sm text-destructive">
                {blocked.reason === 'outbox-not-empty' ? t.detachBlocked(blocked.pending) : t.detachOffline}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => void detach()}>{t.detachConfirm}</Button>
              <Button variant="outline" onClick={() => { setConfirm(false); setBlocked(null); }}>{de.lock.cancel}</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirm(true)}>{t.detachAction}</Button>
        )}
      </CardContent>
    </Card>
  );
}
