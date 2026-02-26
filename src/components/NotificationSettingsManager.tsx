// src/components/NotificationSettingsManager.tsx
// Notification-Einstellungen für die Settings-View

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  getNotificationSettings,
  saveNotificationSettings,
  hasNotificationPermission,
  requestNotificationPermission,
  scheduleNotification,
  type NotificationSettings,
} from '@/services/notificationService';

export function NotificationSettingsManager() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [hasPerm, setHasPerm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const saved = await getNotificationSettings();
      setSettings(saved ?? { enabled: false, frequency: 'daily', time: '20:00' });
      setHasPerm(hasNotificationPermission());
      setLoading(false);
    }
    loadSettings();
  }, []);

  async function handleToggle(enabled: boolean) {
    if (enabled && !hasPerm) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast({ title: 'Benachrichtigungen nicht erlaubt', variant: 'destructive' });
        return;
      }
      setHasPerm(true);
    }
    const updated = { ...settings!, enabled };
    setSettings(updated);
    await saveNotificationSettings(updated);
    if (enabled) {
      scheduleNotification(updated);
      toast({ title: '✅ Erinnerungen aktiviert' });
    } else {
      toast({ title: 'Erinnerungen deaktiviert' });
    }
  }

  async function handleSave() {
    if (!settings) return;
    await saveNotificationSettings(settings);
    if (settings.enabled) scheduleNotification(settings);
    toast({ title: '✅ Einstellungen gespeichert' });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Lädt...</p>;
  if (!settings) return null;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {settings.enabled
            ? <Bell className="h-5 w-5 text-blue-600" />
            : <BellOff className="h-5 w-5 text-gray-400" />}
          <div>
            <p className="font-medium text-sm">
              {settings.enabled ? 'Aktiviert' : 'Deaktiviert'}
            </p>
            <p className="text-xs text-muted-foreground">
              {settings.enabled
                ? `${settings.frequency === 'daily' ? 'Täglich' : settings.frequency === 'weekly' ? 'Wöchentlich' : 'Monatlich'} um ${settings.time} Uhr`
                : 'Keine Erinnerungen'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => handleToggle(!settings.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? 'bg-primary' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Häufigkeit + Uhrzeit */}
      {settings.enabled && (
        <>
          <div className="space-y-2">
            <Label className="text-sm">Häufigkeit</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map(f => (
                <Button
                  key={f}
                  variant={settings.frequency === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSettings(s => s ? { ...s, frequency: f } : s)}
                >
                  {f === 'daily' ? 'Täglich' : f === 'weekly' ? 'Wöchentlich' : 'Monatlich'}
                </Button>
              ))}
            </div>
          </div>

          {settings.frequency === 'daily' && (
            <div className="space-y-2">
              <Label className="text-sm">Uhrzeit</Label>
              <Input
                type="time"
                value={settings.time}
                onChange={e => setSettings(s => s ? { ...s, time: e.target.value } : s)}
              />
            </div>
          )}

          <Button onClick={handleSave} className="w-full">
            Änderungen speichern
          </Button>
        </>
      )}

      {settings.lastShown && (
        <p className="text-xs text-muted-foreground">
          Letzte Erinnerung: {new Date(settings.lastShown).toLocaleString('de-DE')}
        </p>
      )}
    </div>
  );
}
