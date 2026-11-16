// Update-Einstellung (UI-22): automatisch oder nur Hinweis; in Einstellungen zusätzlich „Nach Updates suchen“.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/auth/AuthContext';
import { DEFAULT_UPDATE_MODE, loadUpdateMode, saveUpdateMode, type UpdateMode } from '@/data/update-settings';
import { checkForUpdate, type UpdateCheck } from '@/sw-client';
import { de } from '@/i18n/de';

const t = de.updates;

export function UpdateModeToggle() {
  const { db } = useAuth();
  const [mode, setMode] = useState<UpdateMode>(DEFAULT_UPDATE_MODE);
  useEffect(() => {
    void loadUpdateMode(db).then(setMode);
  }, [db]);
  const options: { value: UpdateMode; label: string }[] = [
    { value: 'auto', label: t.modeAuto },
    { value: 'notify', label: t.modeNotify },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p id="update-mode-label" className="text-sm font-medium">{t.modeLabel}</p>
      <ToggleGroup aria-labelledby="update-mode-label">
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            pressed={mode === o.value}
            onClick={() => {
              setMode(o.value);
              void saveUpdateMode(db, o.value);
            }}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">{mode === 'auto' ? t.modeAutoHint : t.modeNotifyHint}</p>
    </div>
  );
}

export function UpdateSettingsCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  async function check() {
    setBusy(true);
    setResult(null);
    setResult(await checkForUpdate());
    setBusy(false);
  }
  return (
    <Card data-testid="update-settings">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <UpdateModeToggle />
        <Button variant="outline" disabled={busy} onClick={() => void check()}>{busy ? t.checking : t.check}</Button>
        {result !== null ? (
          <p role="status" className="text-sm text-muted-foreground">
            {result === 'current' ? t.current : result === 'available' ? t.availableHint : t.unsupported}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
