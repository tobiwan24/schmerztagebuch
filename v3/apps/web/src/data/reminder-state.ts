// Erinnerungs-Einstellungen je Gerät (nicht synchronisiert — Benachrichtigungen sind gerätebezogen).
// Die Tagebuch-Erinnerung behält ihre ursprünglichen Schlüssel (kein Migrationsschritt nötig); die Übungs-Erinnerung (UI-32)
// liegt unter eigenen Schlüsseln.
import { DEFAULT_REMINDERS, type ReminderKind, type ReminderSettings } from '@/reminders/reminders';
import type { StbDb } from './db';

const SETTINGS: Record<ReminderKind, string> = { diary: 'reminder:settings', training: 'reminder:training:settings' };
const LAST_SHOWN: Record<ReminderKind, string> = { diary: 'reminder:last-shown', training: 'reminder:training:last-shown' };

export async function loadReminder(db: StbDb, kind: ReminderKind = 'diary'): Promise<ReminderSettings> {
  return { ...DEFAULT_REMINDERS[kind], ...((await db.keys.get(SETTINGS[kind]))?.value as Partial<ReminderSettings> | undefined) };
}

export async function saveReminder(db: StbDb, s: ReminderSettings, kind: ReminderKind = 'diary'): Promise<void> {
  await db.keys.put({ id: SETTINGS[kind], value: s });
}

export async function loadLastShown(db: StbDb, kind: ReminderKind = 'diary'): Promise<string | null> {
  return ((await db.keys.get(LAST_SHOWN[kind]))?.value as string | undefined) ?? null;
}

export async function saveLastShown(db: StbDb, day: string, kind: ReminderKind = 'diary'): Promise<void> {
  await db.keys.put({ id: LAST_SHOWN[kind], value: day });
}
