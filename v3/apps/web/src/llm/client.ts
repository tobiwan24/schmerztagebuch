// KI-Client (Spec 08, M19): spricht nur mit dem eigenen Server (`/api/v1/llm/*`); Provider und Schlüssel liegen dort.
// Opt-in (Standard aus) liegt im localStorage `stb-v3-llm`: Darstellungs-/Einwilligungsinformation ohne Gesundheitsdaten.
// Nie Warteschlange oder Outbox: Der Klartext eines Vorgangs existiert nur im Arbeitsspeicher (A-086, A-088).
import { llmStatusSchema, type LlmStatus } from '@stb/sync-protocol';

export const LLM_OPT_IN_KEY = 'stb-v3-llm';

export function readLlmOptIn(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(LLM_OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLlmOptIn(on: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): void {
  try {
    if (on) storage.setItem(LLM_OPT_IN_KEY, '1');
    else storage.removeItem(LLM_OPT_IN_KEY);
  } catch {
    /* Speicher gesperrt: Opt-in bleibt aus (sicherer Standard). */
  }
}

export type LlmClientErrorCode = 'offline' | 'unauthenticated' | 'disabled' | 'rate-limited' | 'budget' | 'refused' | 'unavailable' | 'invalid-output' | 'too-large' | 'failed';

export class LlmClientError extends Error {
  constructor(readonly code: LlmClientErrorCode) {
    super(code);
    this.name = 'LlmClientError';
  }
}

/** Status des Servers; `null` = KI auf dem Server aus (404 `llm_disabled`). */
export async function fetchLlmStatus(fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<LlmStatus | null> {
  let res: Response;
  try {
    res = await fetchFn('/api/v1/llm/status', { credentials: 'include', cache: 'no-store' });
  } catch {
    throw new LlmClientError('offline');
  }
  if (res.status === 404) return null;
  if (res.status === 401) throw new LlmClientError('unauthenticated');
  if (!res.ok) throw new LlmClientError('failed');
  const parsed = llmStatusSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new LlmClientError('failed');
  return parsed.data;
}

export type LlmAvailability = 'hidden' | 'disabled' | 'enabled';

/**
 * Sichtbarkeit der KI-Knöpfe: ausgeblendet ohne Konto (local-only), bei serverseitig `off` (`status === null`),
 * unbekanntem Status oder ausgeschaltetem Opt-in; deaktiviert, solange das Gerät offline ist.
 */
export function llmAvailability(o: { syncAttached: boolean; status: LlmStatus | null | undefined; optIn: boolean; online: boolean }): LlmAvailability {
  if (!o.syncAttached || !o.status || !o.optIn) return 'hidden';
  return o.online ? 'enabled' : 'disabled';
}
