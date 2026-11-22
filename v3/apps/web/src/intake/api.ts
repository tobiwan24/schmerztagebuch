// HTTP-Client für Intake-Schlüssel und -Items (Spec 08; Server `apps/server/src/intake/routes.ts`).
import type { IntakeItemsApi } from './pickup.js';
import type { IntakeKeyApi } from './setup.js';

export function createIntakeApi(baseUrl = '', fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): IntakeKeyApi & IntakeItemsApi & { revoke(diaryId: string, keyId: string): Promise<void> } {
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method, credentials: 'include', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Intake-Anfrage fehlgeschlagen: HTTP ${res.status}`);
    return res;
  }
  return {
    async register(diaryId, body) {
      return (await (await call('POST', `/api/v1/diaries/${encodeURIComponent(diaryId)}/intake-keys`, body)).json()) as { id: string };
    },
    async list(diaryId) {
      return (await (await call('GET', `/api/v1/diaries/${encodeURIComponent(diaryId)}/intake-items`)).json()) as { id: string; sealed: string; receivedAt: number }[];
    },
    async ack(itemId) {
      await call('DELETE', `/api/v1/intake-items/${encodeURIComponent(itemId)}`);
    },
    async revoke(diaryId, keyId) {
      await call('DELETE', `/api/v1/diaries/${encodeURIComponent(diaryId)}/intake-keys/${encodeURIComponent(keyId)}`);
    },
  };
}
