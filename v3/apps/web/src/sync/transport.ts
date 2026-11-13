// Transport zwischen Sync-Engine und Server (Spec 04 „Protokoll"). Austauschbar: Browser nutzt `fetch`,
// Integrationstests einen Adapter auf `fastify.inject`.
import { pullResponseSchema, pushResponseSchema, type PullQuery, type PullResponse, type PushRequest, type PushResponse } from '@stb/sync-protocol';

export interface SyncTransport {
  push(req: PushRequest): Promise<PushResponse>;
  pull(q: PullQuery): Promise<PullResponse>;
  /** Verschlüsselten Anhang hochladen (Spec 04 `/blobs`, idempotent). */
  putBlob?(diaryId: string, id: string, ciphertext: string): Promise<void>;
  /** Verschlüsselten Anhang laden; `null`, wenn der Server ihn (noch) nicht hat. */
  getBlob?(id: string): Promise<string | null>;
}

export class TransportError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'TransportError';
  }
}

/** HTTP-Transport über `fetch` (Cookie-Sitzung, gleicher Origin). */
export function createFetchTransport(baseUrl: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): SyncTransport {
  async function call(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetchFn(`${baseUrl}${path}`, { credentials: 'include', cache: 'no-store', ...init });
    if (!res.ok) throw new TransportError(res.status, `Sync-Anfrage fehlgeschlagen: HTTP ${res.status}`);
    return res.json();
  }
  return {
    async push(req) {
      return pushResponseSchema.parse(await call('/api/v1/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }));
    },
    async pull(q) {
      const qs = new URLSearchParams({ diaryId: q.diaryId, since: String(q.since), limit: String(q.limit) });
      return pullResponseSchema.parse(await call(`/api/v1/sync/pull?${qs}`, { method: 'GET' }));
    },
    async putBlob(diaryId, id, ciphertext) {
      await call(`/api/v1/blobs/${encodeURIComponent(id)}?${new URLSearchParams({ diaryId })}`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: ciphertext });
    },
    async getBlob(id) {
      const res = await fetchFn(`${baseUrl}/api/v1/blobs/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new TransportError(res.status, `Anhang laden fehlgeschlagen: HTTP ${res.status}`);
      return res.text();
    },
  };
}
