// Erinnerungen (Spec 10, UI-08): eingestellte Uhrzeit löst eine Notification über den Service Worker aus — mit
// gefälschter Uhr (vitest Fake-Timer) und gefälschter SW-Registrierung.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextReminderAt, reminderDueNow, showViaServiceWorker, startReminders, REMINDER_TEXTS, REMINDER_TITLE, type ReminderSettings } from '../../apps/web/src/reminders/reminders.js';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('Erinnerungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('UI-08: eingestellte Uhrzeit löst eine Notification über den Service Worker aus (gefälschte Uhr)', async () => {
    vi.setSystemTime(new Date(2026, 2, 2, 19, 0)); // Montag 19:00
    const showNotification = vi.fn(async () => undefined);
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ showNotification }) } });
    let last: string | null = null;
    const stop = startReminders(
      { enabled: true, time: '20:00', days: [1, 2, 3, 4, 5] },
      {
        now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
        show: showViaServiceWorker, loadLastShown: async () => last, saveLastShown: async (d) => void (last = d),
      },
    );
    await flush();
    expect(showNotification).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(showNotification).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000); // 20:00
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(REMINDER_TITLE, expect.objectContaining({ tag: 'stb-reminder' }));
    expect(last).toBe('2026-03-02');
    // nächster Tag (Dienstag) 20:00 → wieder; Samstag nicht gewählt
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(showNotification).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4 * 24 * 3_600_000); // bis Samstag 20:00: Mi, Do, Fr
    expect(showNotification).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(24 * 3_600_000); // Samstag
    expect(showNotification).toHaveBeenCalledTimes(5);
    stop();
    await vi.advanceTimersByTimeAsync(7 * 24 * 3_600_000);
    expect(showNotification).toHaveBeenCalledTimes(5);
  });

  it('UI-32: Übungs-Erinnerung hat eigene Uhrzeit, eigene Tage, eigenen Text und eigenes Notification-Tag neben der Tagebuch-Erinnerung', async () => {
    vi.setSystemTime(new Date(2026, 2, 2, 17, 0)); // Montag 17:00
    const showNotification = vi.fn(async () => undefined);
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ showNotification }) } });
    const deps = (kind: 'diary' | 'training') => {
      let last: string | null = null;
      return {
        now: () => Date.now(), setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimer: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
        show: (title: string, body: string) => showViaServiceWorker(title, body, REMINDER_TEXTS[kind].tag), loadLastShown: async () => last, saveLastShown: async (d: string) => void (last = d),
      };
    };
    const stops = [
      startReminders({ enabled: true, time: '20:00', days: [1, 2, 3, 4, 5, 6, 7] }, deps('diary')),
      startReminders({ enabled: true, time: '18:00', days: [1, 3] }, deps('training'), REMINDER_TEXTS.training),
    ];
    await vi.advanceTimersByTimeAsync(3_600_000); // 18:00 Montag: nur Übungen
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenLastCalledWith(REMINDER_TEXTS.training.title, expect.objectContaining({ tag: 'stb-reminder-training', body: REMINDER_TEXTS.training.body }));
    await vi.advanceTimersByTimeAsync(2 * 3_600_000); // 20:00: Tagebuch
    expect(showNotification).toHaveBeenCalledTimes(2);
    expect(showNotification).toHaveBeenLastCalledWith(REMINDER_TITLE, expect.objectContaining({ tag: 'stb-reminder' }));
    await vi.advanceTimersByTimeAsync(22 * 3_600_000); // Dienstag 18:00: Übungen nicht gewählt
    expect(showNotification).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2 * 3_600_000); // Dienstag 20:00: Tagebuch
    expect(showNotification).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(22 * 3_600_000); // Mittwoch 18:00: Übungen
    expect(showNotification).toHaveBeenCalledTimes(4);
    stops.forEach((stop) => stop());
  });

  it('verpasste Erinnerung des Tages erscheint beim Öffnen einmal; ohne Erlaubnis keine Notification', async () => {
    vi.setSystemTime(new Date(2026, 2, 2, 21, 30));
    const s: ReminderSettings = { enabled: true, time: '20:00', days: [1] };
    expect(reminderDueNow(s, null, Date.now())).toBe(true);
    expect(reminderDueNow(s, '2026-03-02', Date.now())).toBe(false);
    expect(reminderDueNow({ ...s, days: [2] }, null, Date.now())).toBe(false);
    expect(new Date(nextReminderAt(s, Date.now())!).toString()).toContain('Mar 09 2026 20:00');
    expect(nextReminderAt({ ...s, enabled: false }, Date.now())).toBeNull();
    expect(nextReminderAt({ ...s, days: [] }, Date.now())).toBeNull();

    const showNotification = vi.fn(async () => undefined);
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied' }));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ showNotification }) } });
    await showViaServiceWorker('x', 'y');
    expect(showNotification).not.toHaveBeenCalled();
  });
});
