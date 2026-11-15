// Einstellungen → Erinnerungen (Spec 10): Uhrzeit und Wochentage, lokale Notification über den Service Worker.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useReminderSettings } from '@/data/useReminders';
import type { ReminderSettings } from '@/reminders/reminders';
import { de } from '@/i18n/de';

const t = de.reminders;

export function ReminderCard() {
  const { state, save, permission } = useReminderSettings();
  const [s, setS] = useState<ReminderSettings | null>(null);
  // Nur einmal aus der DB übernehmen; danach führt die Karte den Stand (Speichern läuft im Hintergrund).
  useEffect(() => {
    if (state.status === 'ok') setS((cur) => cur ?? state.data);
  }, [state]);
  if (!s) return null;
  const update = (next: ReminderSettings) => {
    setS(next);
    void save(next);
  };
  return (
    <Card data-testid="reminder-card">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Checkbox id="reminder-enabled" checked={s.enabled} onChange={(e) => update({ ...s, enabled: e.target.checked })} />
          <Label htmlFor="reminder-enabled">{t.enabled}</Label>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="reminder-time">{t.time}</Label>
          <Input id="reminder-time" type="time" className="w-32" value={s.time} disabled={!s.enabled} onChange={(e) => e.target.value && update({ ...s, time: e.target.value })} />
        </div>
        <ToggleGroup aria-label={t.days}>
          {t.dayNames.map((name, i) => {
            const day = i + 1;
            const on = s.days.includes(day);
            return (
              <ToggleGroupItem key={day} pressed={on} disabled={!s.enabled} className="px-1 text-xs"
                onClick={() => update({ ...s, days: on ? s.days.filter((x) => x !== day) : [...s.days, day].sort() })}>
                {name}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        {s.enabled && permission === 'denied' ? <p role="alert" className="text-sm text-destructive">{t.denied}</p> : null}
        {s.enabled && permission === 'unsupported' ? <p className="text-sm text-muted-foreground">{t.unsupported}</p> : null}
      </CardContent>
    </Card>
  );
}
