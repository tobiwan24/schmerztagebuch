// Erinnerungs-Einstellungen je Gerät (nicht synchronisiert — Benachrichtigungen sind gerätebezogen).
import { DEFAULT_REMINDER, type ReminderSettings } from '@/reminders/reminders';
import type { StbDb } from './db';

const SETTINGS = 'reminder:settings';
const LAST_SHOWN = 'reminder:last-shown';

export async function loadReminder(db: StbDb): Promise<ReminderSettings> {
  return { ...DEFAULT_REMINDER, ...((await db.keys.get(SETTINGS))?.value as Partial<ReminderSettings> | undefined) };
}

export async function saveReminder(db: StbDb, s: ReminderSettings): Promise<void> {
  await db.keys.put({ id: SETTINGS, value: s });
}

export async function loadLastShown(db: StbDb): Promise<string | null> {
  return ((await db.keys.get(LAST_SHOWN))?.value as string | undefined) ?? null;
}

export async function saveLastShown(db: StbDb, day: string): Promise<void> {
  await db.keys.put({ id: LAST_SHOWN, value: day });
}
