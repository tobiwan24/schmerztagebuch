// Erinnerungen: Einstellungen lesen/speichern und — solange die App offen ist — planen (Spec 10).
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { showViaServiceWorker, startReminders, type ReminderSettings } from '@/reminders/reminders';
import { loadLastShown, loadReminder, saveLastShown, saveReminder } from './reminder-state';
import { useQuery } from './useQuery';

export function useReminderSettings() {
  const { db } = useAuth();
  const query = useQuery(() => loadReminder(db), [db]);
  // Speichern nacheinander (schnelle Folgeänderungen dürfen sich nicht überholen); die Berechtigungsabfrage wartet
  // auf den Nutzer und darf das Speichern daher nicht aufhalten.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const save = useCallback(
    (s: ReminderSettings) => {
      chain.current = chain.current.then(async () => {
        await saveReminder(db, s);
        window.dispatchEvent(new Event('stb-reminder-changed'));
      });
      if (s.enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
      return chain.current;
    },
    [db],
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
