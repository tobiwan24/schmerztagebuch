// Gerätemerker „Sync zurückgestellt“ (UI-20): Konto bleibt, aber alle Tagebücher sind `local-only` und es gehen keine
// Requests mehr an den Server.
import type { StbDb } from './db.js';

export const SYNC_DETACHED_ID = 'sync-detached';

export async function isSyncDetached(db: StbDb): Promise<boolean> {
  return (await db.device.get(SYNC_DETACHED_ID))?.value === true;
}
