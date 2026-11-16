// Erinnerungen: Einstellungen lesen/speichern und — solange die App offen ist — planen (Spec 10).
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { REMINDER_KINDS, REMINDER_TEXTS, showViaServiceWorker, startReminders, type ReminderKind, type ReminderSettings } from '@/reminders/reminders';
import { loadLastShown, loadReminder, saveLastShown, saveReminder } from './reminder-state';
import { useQuery } from './useQuery';

export function useReminderSettings(kind: ReminderKind = 'diary') {
  const { db } = useAuth();
  const query = useQuery(() => loadReminder(db, kind), [db, kind]);
  // Speichern nacheinander (schnelle Folgeänderungen dürfen sich nicht überholen); die Berechtigungsabfrage wartet
  // auf den Nutzer und darf das Speichern daher nicht aufhalten.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const save = useCallback(
    (s: ReminderSettings) => {
      chain.current = chain.current.then(async () => {
        await saveReminder(db, s, kind);
        window.dispatchEvent(new Event('stb-reminder-changed'));
      });
      if (s.enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
      return chain.current;
    },
    [db, kind],
  );
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  return { state: query, save, permission };
}

/** Plant die Erinnerungen (Tagebuch und Übungen) im Hintergrund; neu bei geänderten Einstellungen. */
export function useReminderScheduler() {
  const { db, now } = useAuth();
  useEffect(() => {
    let stops: (() => void)[] = [];
    let cancelled = false;
    let generation = 0;
    async function start() {
      const mine = ++generation;
      stops.forEach((fn) => fn());
      stops = [];
      for (const kind of REMINDER_KINDS) {
        const s = await loadReminder(db, kind);
        if (cancelled || mine !== generation) return;
        const texts = REMINDER_TEXTS[kind];
        stops.push(
          startReminders(
            s,
            {
              now, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
              show: (title, body) => showViaServiceWorker(title, body, texts.tag), loadLastShown: () => loadLastShown(db, kind), saveLastShown: (d) => saveLastShown(db, d, kind),
            },
            texts,
          ),
        );
      }
    }
    void start();
    const onChange = () => void start();
    window.addEventListener('stb-reminder-changed', onChange);
    return () => {
      cancelled = true;
      stops.forEach((fn) => fn());
      window.removeEventListener('stb-reminder-changed', onChange);
    };
  }, [db, now]);
}
