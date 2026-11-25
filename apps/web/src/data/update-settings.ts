// Update-Einstellung (UI-22, A-057/A-077): „auto" (Standard) aktiviert eine neue Version selbst, sobald die App in den
// Hintergrund geht oder neu startet; „notify" zeigt nur den Hinweis. Geräteweit in `device`.
import type { StbDb } from './db.js';

export type UpdateMode = 'auto' | 'notify';
export const DEFAULT_UPDATE_MODE: UpdateMode = 'auto';
/** Meldet dem Update-Hinweis, dass sich die Einstellung geändert hat. */
export const UPDATE_MODE_EVENT = 'stb:update-mode';
const STORE_ID = 'update-mode';

export async function loadUpdateMode(db: StbDb): Promise<UpdateMode> {
  const v = (await db.device.get(STORE_ID))?.value;
  return v === 'notify' ? 'notify' : DEFAULT_UPDATE_MODE;
}

export async function saveUpdateMode(db: StbDb, mode: UpdateMode): Promise<void> {
  await db.device.put({ id: STORE_ID, value: mode });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UPDATE_MODE_EVENT));
}
