// Einstellungen → Sperre (Spec 03 „Sitzung", CRY-20): Sperre bei Inaktivität. „Entsperrt bleiben“ ist entfallen (RDM-035).
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/auth/AuthContext';
import { DEFAULT_LOCK_SETTINGS, IDLE_MINUTES_OPTIONS, loadLockSettings, saveLockSettings, type LockSettings } from '@/data/lock-settings';
import { de } from '@/i18n/de';

const t = de.lock;

export function LockSettingsCard() {
  const { db } = useAuth();
  const [settings, setSettings] = useState<LockSettings>(DEFAULT_LOCK_SETTINGS);
  useEffect(() => {
    void loadLockSettings(db).then(setSettings);
  }, [db]);

  return (
    <Card data-testid="lock-settings">
      <CardHeader>
        <CardTitle>{t.settingsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
