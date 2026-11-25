// Tägliche Erinnerung (Spec 10 „Funktionsparität": Einstellungen → Erinnerungen, Uhrzeit + Wochentage, lokale
// Notification über den Service Worker; Nachfolger von v2 `notificationService`). Ohne Push-Server: geplant wird,
// solange die App offen ist; eine heute verpasste Erinnerung erscheint beim nächsten Öffnen (einmal pro Tag).

export interface ReminderSettings {
  enabled: boolean;
  /** `HH:MM` in Gerätezeit. */
  time: string;
  /** Wochentage, 1 = Montag … 7 = Sonntag (ISO). */
  days: number[];
}

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, time: '20:00', days: [1, 2, 3, 4, 5, 6, 7] };

/** Art der Erinnerung: Tagebuch-Eintrag oder Übungen (UI-32, eigene Uhrzeit und Tage). */
export type ReminderKind = 'diary' | 'training';
export const REMINDER_KINDS: readonly ReminderKind[] = ['diary', 'training'];
export const DEFAULT_REMINDERS: Record<ReminderKind, ReminderSettings> = {
  diary: DEFAULT_REMINDER,
  training: { enabled: false, time: '18:00', days: [1, 2, 3, 4, 5, 6, 7] },
};

const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function atTime(base: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Nächster Erinnerungszeitpunkt nach `now` (ms) oder `null` (aus / keine Tage). */
export function nextReminderAt(s: ReminderSettings, now: number): number | null {
  if (!s.enabled || !s.days.length || !/^\d{2}:\d{2}$/.test(s.time)) return null;
  const today = new Date(now);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const at = atTime(day, s.time);
    if (at.getTime() > now && s.days.includes(isoWeekday(at))) return at.getTime();
  }
  return null;
}

/** Ist die heutige Erinnerung fällig (Uhrzeit vorbei, heute gewählt, heute noch nicht gezeigt)? */
export function reminderDueNow(s: ReminderSettings, lastShownDay: string | null, now: number): boolean {
  if (!s.enabled || !/^\d{2}:\d{2}$/.test(s.time)) return false;
  const d = new Date(now);
  return s.days.includes(isoWeekday(d)) && atTime(d, s.time).getTime() <= now && lastShownDay !== localDay(d);
}

export interface ReminderDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Notification zeigen (SW `registration.showNotification`, sonst `new Notification`). */
  show(title: string, body: string): Promise<void>;
  loadLastShown(): Promise<string | null>;
  saveLastShown(day: string): Promise<void>;
}

export const REMINDER_TITLE = 'Zeit für deinen Eintrag';
export const REMINDER_BODY = 'Wie geht es dir heute?';

/** Notification-Text und -Tag je Art (verschiedene Tags, damit beide nebeneinander erscheinen können). Beschreibend, ohne Empfehlung. */
export interface ReminderTexts {
  title: string;
  body: string;
  tag: string;
}
export const REMINDER_TEXTS: Record<ReminderKind, ReminderTexts> = {
  diary: { title: REMINDER_TITLE, body: REMINDER_BODY, tag: 'stb-reminder' },
  training: { title: 'Zeit für deine Übungen', body: 'Deine Trainingsvorlage wartet.', tag: 'stb-reminder-training' },
};
/** Browser-Timer sind auf ~24,8 Tage begrenzt; längere Wartezeiten werden in Etappen geplant. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Plant die Erinnerungen; Rückgabe: Abmelden. */
export function startReminders(s: ReminderSettings, deps: ReminderDeps, texts: ReminderTexts = REMINDER_TEXTS.diary): () => void {
  let handle: unknown = null;
  let stopped = false;
  async function fire() {
    const day = localDay(new Date(deps.now()));
    await deps.saveLastShown(day);
    await deps.show(texts.title, texts.body);
  }
  function plan() {
    if (stopped) return;
    const next = nextReminderAt(s, deps.now());
    if (next === null) return;
    const wait = next - deps.now();
    handle = deps.setTimer(() => {
      if (stopped) return;
      if (deps.now() >= next) void fire().finally(plan);
      else plan(); // Etappe einer langen Wartezeit
    }, Math.min(wait, MAX_TIMER_MS));
  }
  void (async () => {
    if (reminderDueNow(s, await deps.loadLastShown(), deps.now())) await fire();
    plan();
  })();
  return () => {
    stopped = true;
    if (handle !== null) deps.clearTimer(handle);
  };
}

/** Notification über den Service Worker (funktioniert auch als installierte PWA auf iOS ≥ 16.4). */
export async function showViaServiceWorker(title: string, body: string, tag = 'stb-reminder'): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const options: NotificationOptions = { body, icon: '/icon-192.png', tag };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}
