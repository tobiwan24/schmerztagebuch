// Einstellungen → Geräte (Konto, Spec 03, CRY-19): eigene Geräte, anderes Gerät sperren, auf diesem Gerät abmelden.
import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/auth/AuthContext';
import { useSync } from '@/data/SyncContext';
import type { DeviceView } from '@/auth/devices';
import { deviceLabel } from '@/lib/device-name';
import { de } from '@/i18n/de';
import { deDevices } from '@/i18n/lazy/devices';

const t = deDevices;
const day = (ms: number) => new Date(ms).toLocaleDateString('de-DE');

export function DevicesSection() {
  const auth = useAuth();
  const sync = useSync();
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<string | 'self' | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      setDevices(await auth.cloud.devices());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function act(run: () => Promise<void>) {
    setBusy(true);
    try {
      await run();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Card data-testid="devices-card">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.hint}</p>
        {sync.rotation?.status === 'running' ? <p data-testid="devices-rotation" className="text-sm text-muted-foreground">{t.rotating}</p> : null}
        {failed ? <p role="alert" className="text-sm text-destructive">{t.failed}</p> : null}
        <ul className="flex flex-col gap-2">
          {(devices ?? []).map((d) => (
            <li key={d.id} data-testid="device-row" data-current={d.current} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Smartphone aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{deviceLabel(d.name, t.unnamed)}</span>
                {d.current ? <Badge>{t.thisDevice}</Badge> : null}
                {d.revokedAt !== null ? <Badge variant="secondary">{t.revoked}</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">{t.added(day(d.createdAt))}</p>
              {!d.current && d.revokedAt === null ? (
                confirm === d.id ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">{t.revokeHint}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void act(async () => { await sync.rotateOwned('device-revoked', () => auth.cloud.revokeDevice(d.id)); await reload(); })}>
                        {t.revokeConfirm}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>{de.lock.cancel}</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirm(d.id)}>{t.revoke}</Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
        {confirm === 'self' ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t.signOutHint}</p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => void act(() => auth.cloud.signOut())}>{t.signOutConfirm}</Button>
              <Button variant="outline" onClick={() => setConfirm(null)}>{de.lock.cancel}</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirm('self')}>{t.signOut}</Button>
        )}
      </CardContent>
    </Card>
  );
}
