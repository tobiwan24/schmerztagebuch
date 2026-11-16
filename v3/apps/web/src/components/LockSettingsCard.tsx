// Einstellungen → Sperre (Spec 03 „Sitzung", CRY-20): Dauer „entsperrt bleiben", Widerruf, Sperre bei Inaktivität.
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/auth/AuthContext';
import { DEFAULT_LOCK_SETTINGS, IDLE_MINUTES_OPTIONS, loadLockSettings, saveLockSettings, type LockSettings } from '@/data/lock-settings';
import { de } from '@/i18n/de';

const t = de.lock;

export function LockSettingsCard() {
  const { db, session } = useAuth();
  const [settings, setSettings] = useState<LockSettings>(DEFAULT_LOCK_SETTINGS);
  const [days, setDays] = useState(String(DEFAULT_LOCK_SETTINGS.stayDays));
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [revoked, setRevoked] = useState(false);

  const reload = useCallback(async () => {
    const [s, stay] = await Promise.all([loadLockSettings(db), session.stayStatus()]);
    setSettings(s);
    setDays(String(s.stayDays));
    setExpiresAt(stay?.expiresAt ?? null);
  }, [db, session]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function saveDays() {
    const next = await saveLockSettings(db, { stayDays: Number(days) });
    setSettings(next);
    setDays(String(next.stayDays));
    // Läuft „entsperrt bleiben“ schon, gilt die neue Dauer ab jetzt.
    if (expiresAt !== null) {
      await session.stayUnlocked(next.stayDays);
      setExpiresAt((await session.stayStatus())?.expiresAt ?? null);
    }
  }

  async function revoke() {
    await session.forgetDevice();
    setExpiresAt(null);
    setRevoked(true);
  }

  return (
    <Card data-testid="lock-settings">
      <CardHeader>
        <CardTitle>{t.settingsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Label htmlFor="stay-days" className="flex-col items-start">
          {t.stayDaysLabel}
          <Input id="stay-days" type="number" inputMode="numeric" min={1} max={30} className="w-24" value={days} onChange={(e) => setDays(e.target.value)} onBlur={() => void saveDays()} />
        </Label>
        <p role="status" data-testid="stay-status" className="text-sm text-muted-foreground">
          {expiresAt !== null ? t.stayActive(new Date(expiresAt).toLocaleDateString('de-DE')) : revoked ? t.stayRevoked : t.stayInactive}
        </p>
        {expiresAt !== null ? (
          <Button variant="outline" onClick={() => void revoke()}>{t.stayRevoke}</Button>
        ) : null}
        <div className="flex flex-col gap-2">
          <p id="idle-label" className="text-sm font-medium">{t.idleLabel}</p>
          <ToggleGroup aria-labelledby="idle-label">
            {IDLE_MINUTES_OPTIONS.map((m) => (
              <ToggleGroupItem key={m} pressed={settings.idleMinutes === m} onClick={() => void saveLockSettings(db, { idleMinutes: m }).then(setSettings)}>
                {m === 0 ? t.idleOff : t.idleMinutes(m)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  );
}
