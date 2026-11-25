// Integrationen anlegen, auflisten, widerrufen (Spec 03/07, M24, EXP-27, A-127). Der Zugangsstring (Token + Schlüssel) entsteht
// hier im Client und wird nie gesendet; der Server bekommt Token-Hash, öffentlichen Schlüssel, DK-Wrap und den Namen,
// verschlüsselt mit der UMK (nur der Besitzer kann ihn lesen).
import { createIntegrationCredentials, fromBase64Url, toBase64Url } from '@stb/crypto';
import { integrationInfoSchema, type IntegrationInfo } from '@stb/sync-protocol';

export type IntegrationErrorCode = 'too-many-integrations' | 'rotation-running' | 'epoch-mismatch' | 'forbidden' | 'offline' | 'failed';

export class IntegrationError extends Error {
  constructor(readonly code: IntegrationErrorCode) {
    super(code);
    this.name = 'IntegrationError';
  }
}

export interface IntegrationView {
  id: string;
  name: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

const subtle = () => globalThis.crypto.subtle;

async function sealName(umk: CryptoKey, name: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, umk, new TextEncoder().encode(name)));
  return `${toBase64Url(iv)}.${toBase64Url(ct)}`;
}

export async function openName(umk: CryptoKey, nameCt: string): Promise<string | null> {
  const [iv, ct] = nameCt.split('.');
  if (!iv || !ct) return null;
  try {
    return new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, umk, fromBase64Url(ct)));
  } catch {
    return null;
  }
}

async function failure(res: Response): Promise<IntegrationError> {
  const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
  if (code === 'too-many-integrations' || code === 'rotation-running' || code === 'epoch-mismatch') return new IntegrationError(code);
  return new IntegrationError(res.status === 403 ? 'forbidden' : 'failed');
}

const base = (diaryId: string) => `/api/v1/diaries/${encodeURIComponent(diaryId)}/integrations`;

async function send(fetchFn: typeof fetch, method: string, url: string, body?: unknown): Promise<Response> {
  try {
    return await fetchFn(url, {
      method, credentials: 'include', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new IntegrationError('offline');
  }
}

/** Legt eine Integration an und liefert den Zugangsstring (einmal anzeigen). */
export async function createIntegration(
  o: { diaryId: string; name: string; dk: { key: CryptoKey; keyEpoch: number }; umk: CryptoKey; origin: string },
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<{ id: string; accessString: string }> {
  const cred = await createIntegrationCredentials(o.dk.key, { diaryId: o.diaryId, keyEpoch: o.dk.keyEpoch }, o.origin);
  const res = await send(fetchFn, 'POST', base(o.diaryId), {
    nameCt: await sealName(o.umk, o.name.trim()),
    publicKey: cred.publicKey,
    tokenHash: cred.tokenHash,
    wrappedDk: JSON.stringify(cred.wrap),
    keyEpoch: o.dk.keyEpoch,
  });
  if (!res.ok) throw await failure(res);
  return { id: ((await res.json()) as { id: string }).id, accessString: cred.accessString };
}

export async function listIntegrations(diaryId: string, umk: CryptoKey, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<IntegrationView[]> {
  const res = await send(fetchFn, 'GET', base(diaryId));
  if (!res.ok) throw await failure(res);
  const list: IntegrationInfo[] = integrationInfoSchema.array().parse(await res.json());
  return Promise.all(list.map(async (i) => ({ id: i.id, name: await openName(umk, i.nameCt), createdAt: i.createdAt, lastUsedAt: i.lastUsedAt, revokedAt: i.revokedAt })));
}

export async function revokeIntegration(diaryId: string, id: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<void> {
  const res = await send(fetchFn, 'DELETE', `${base(diaryId)}/${encodeURIComponent(id)}`);
  if (!res.ok) throw await failure(res);
}
