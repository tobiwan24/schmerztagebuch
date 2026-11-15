// Erinnerungen: Einstellungen lesen/speichern und — solange die App offen ist — planen (Spec 10).
import { useCallback, useEffect } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { showViaServiceWorker, startReminders, type ReminderSettings } from '@/reminders/reminders';
import { loadLastShown, loadReminder, saveLastShown, saveReminder } from './reminder-state';
import { useQuery } from './useQuery';

export function useReminderSettings() {
  const { db } = useAuth();
  const query = useQuery(() => loadReminder(db), [db]);
  const save = useCallback(
    async (s: ReminderSettings) => {
      if (s.enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
      await saveReminder(db, s);
      query.retry();
      window.dispatchEvent(new Event('stb-reminder-changed'));
    },
    [db, query],
  );
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  return { state: query, save, permission };
}

/** Plant die Erinnerung im Hintergrund; neu bei geänderten Einstellungen. */
export function useReminderScheduler() {
  const { db, now } = useAuth();
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    async function start() {
      stop?.();
      const s = await loadReminder(db);
      if (cancelled) return;
      stop = startReminders(s, {
        now, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
        show: showViaServiceWorker, loadLastShown: () => loadLastShown(db), saveLastShown: (d) => saveLastShown(db, d),
      });
    }
    void start();
    const onChange = () => void start();
    window.addEventListener('stb-reminder-changed', onChange);
    return () => {
      cancelled = true;
      stop?.();
      window.removeEventListener('stb-reminder-changed', onChange);
    };
  }, [db, now]);
}
