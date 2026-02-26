// src/services/notificationService.ts
// Notification-System: Settings, Permission, Scheduling
// Das NotificationSettings-Interface wird NUR hier definiert – überall sonst importieren!

import db from '../db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:mm
  lastShown?: string; // ISO date string
}

const SETTINGS_KEY = 'notifications';

// ── DB-Zugriff (JSON.stringify/parse, da Settings.value = string) ─────────────

export async function getNotificationSettings(): Promise<NotificationSettings | null> {
  const setting = await db.settings.get(SETTINGS_KEY);
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value) as NotificationSettings;
  } catch {
    return null;
  }
}

export async function saveNotificationSettings(s: NotificationSettings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: JSON.stringify(s) });
}

// ── Permission ────────────────────────────────────────────────────────────────

export function hasNotificationPermission(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}

// ── Notification senden ───────────────────────────────────────────────────────

export async function showNotification(title: string, body?: string): Promise<void> {
  if (!hasNotificationPermission()) return;

  const options: NotificationOptions = {
    body,
    icon: '/icon-192.png',
    tag: 'diary-reminder',
    // Hinweis: 'actions' nur bei Service-Worker-Notifications unterstützt,
    // nicht bei new Notification() – daher hier weggelassen.
  };

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
    } catch {
      // Fallback auf Basis-Notification
      new Notification(title, options);
    }
  } else {
    new Notification(title, options);
  }
}

// ── Scheduling ────────────────────────────────────────────────────────────────

function calcNextTime(s: NotificationSettings): Date {
  const [h, m] = s.time.split(':').map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);

  if (next <= new Date()) {
    if (s.frequency === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (s.frequency === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
    }
  }
  return next;
}

export function scheduleNotification(s: NotificationSettings): void {
  if (!s.enabled || !hasNotificationPermission()) return;

  const delay = calcNextTime(s).getTime() - Date.now();
  console.log(`Nächste Erinnerung in ${Math.round(delay / 60000)} min`);

  setTimeout(async () => {
    await showNotification('Zeit für deinen Eintrag! 📝', 'Wie geht es dir heute?');
    await saveNotificationSettings({ ...s, lastShown: new Date().toISOString() });
    scheduleNotification(s); // rekursiv für nächste Erinnerung
  }, delay);
}

export async function initializeNotifications(): Promise<void> {
  const s = await getNotificationSettings();
  if (s?.enabled && hasNotificationPermission()) {
    scheduleNotification(s);
  }
}
