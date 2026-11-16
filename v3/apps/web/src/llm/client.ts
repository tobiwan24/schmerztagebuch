// KI-Client (Spec 08, M19): spricht nur mit dem eigenen Server (`/api/v1/llm/*`); Provider und Schlüssel liegen dort.
// Opt-in (Standard aus) liegt im localStorage `stb-v3-llm`: Darstellungs-/Einwilligungsinformation ohne Gesundheitsdaten.
// Nie Warteschlange oder Outbox: Der Klartext eines Vorgangs existiert nur im Arbeitsspeicher (A-086, A-088).
import { llmFillResponseSchema, llmStatusSchema, type LlmFillRequest, type LlmFillResponse, type LlmStatus } from '@stb/sync-protocol';

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

/** Fehlerabbildung der Server-Antworten (nur Codes, nie Inhalte). */
export function llmErrorFromResponse(status: number, body: unknown): LlmClientError {
  const code = typeof (body as { error?: unknown } | null)?.error === 'string' ? (body as { error: string }).error : '';
  if (status === 401) return new LlmClientError('unauthenticated');
  if (status === 404) return new LlmClientError('disabled');
  if (status === 413) return new LlmClientError('too-large');
  if (status === 429) return new LlmClientError(code === 'llm_budget_exhausted' ? 'budget' : 'rate-limited');
  if (status === 422) return new LlmClientError('refused');
  if (status === 503) return new LlmClientError('unavailable');
  if (status === 502 && code === 'llm_invalid_output') return new LlmClientError('invalid-output');
  return new LlmClientError('failed');
}

/** POST an einen LLM-Endpunkt. Nur online und nur im Arbeitsspeicher: keine Warteschlange, kein Speichern des Texts (A-086). */
async function postLlm(kind: 'fill' | 'roles' | 'summary', payload: unknown, fetchFn: typeof fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(`/api/v1/llm/${kind}`, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch {
    throw new LlmClientError('offline');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw llmErrorFromResponse(res.status, body);
  return body;
}

/** Freitext → Feldentwurf. Die Antwort ist nur ein Vorschlag; Prüfung gegen die Blöcke macht `applyFill`. */
export async function requestFill(req: LlmFillRequest, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<LlmFillResponse> {
  const parsed = llmFillResponseSchema.safeParse(await postLlm('fill', req, fetchFn));
  if (!parsed.success) throw new LlmClientError('invalid-output');
  return parsed.data;
}
