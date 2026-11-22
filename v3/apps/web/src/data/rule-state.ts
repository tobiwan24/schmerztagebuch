// Hinweis-Regeln: letzte Auslösung je Regel (Cooldown), je Gerät und nicht synchronisiert.
import type { StbDb } from './db';

const KEY = 'rules:last-fired';

export async function loadLastFired(db: StbDb): Promise<Record<string, string>> {
  return ((await db.keys.get(KEY))?.value as Record<string, string> | undefined) ?? {};
}

export async function saveLastFired(db: StbDb, value: Record<string, string>): Promise<void> {
  await db.keys.put({ id: KEY, value });
}
