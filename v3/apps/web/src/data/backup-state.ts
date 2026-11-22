// Backup-Zustand des Geräts (Spec 07 „Backup"): Zeitpunkt des letzten Backups und Erinnerungsfrist (Standard 7 Tage).
// Erinnerung nur im Modus „nur auf diesem Gerät", solange seit dem letzten Backup (oder der Kontoanlage) mehr als n Tage
// vergangen sind. Im Konto-Modus nie (Daten liegen verschlüsselt auf dem Server).
import type { StbDb } from './db';

const LAST_BACKUP = 'backup:last';
const REMINDER_DAYS = 'backup:reminder-days';
export const DEFAULT_REMINDER_DAYS = 7;
const DAY_MS = 86_400_000;

export async function lastBackupAt(db: StbDb): Promise<number | null> {
  return ((await db.keys.get(LAST_BACKUP))?.value as number | undefined) ?? null;
}

export async function markBackupDone(db: StbDb, at: number): Promise<void> {
  await db.keys.put({ id: LAST_BACKUP, value: at });
}

export async function reminderDays(db: StbDb): Promise<number> {
  return ((await db.keys.get(REMINDER_DAYS))?.value as number | undefined) ?? DEFAULT_REMINDER_DAYS;
}

export async function setReminderDays(db: StbDb, days: number): Promise<void> {
  await db.keys.put({ id: REMINDER_DAYS, value: Math.max(1, Math.min(365, Math.round(days))) });
}

/** Erinnerung fällig? `accountCreatedAt` gilt als Startpunkt, solange es noch kein Backup gibt. */
export function backupDue(input: { mode: 'local-only' | 'cloud-primary' | null; lastBackup: number | null; accountCreatedAt: number | null; days: number; now: number }): boolean {
  if (input.mode !== 'local-only') return false;
  const since = input.lastBackup ?? input.accountCreatedAt;
  if (since === null) return false;
  return input.now - since > input.days * DAY_MS;
}
