// Arzt-Link erstellen und abrufen (Spec 07, M18). Der Schlüssel K steht nur im URL-Fragment: er wird nie in eine
// Anfrage geschrieben, die Anfragen enthalten nur die ID und den Chiffretext.
import { buildReportLink, decryptReport, encryptReport, generateShareId, generateShareKey } from '@stb/crypto';
import { SHARE_CIPHERTEXT_MAX_CHARS, sharesListResponseSchema, type ShareInfo } from '@stb/sync-protocol';
import { decodeReportPackage, type ReportPackage } from './report-package.js';

export type ReportLinkErrorCode = 'too-large' | 'unauthenticated' | 'rate-limited' | 'offline' | 'failed' | 'not-found' | 'expired' | 'exhausted' | 'revoked' | 'bad-key' | 'bad-package';

export class ReportLinkError extends Error {
  constructor(readonly code: ReportLinkErrorCode) {
    super(code);
    this.name = 'ReportLinkError';
  }
}

/** Link-ID aus dem Pfad `/r/<id>`; `null`, wenn der Pfad kein Arzt-Link ist. */
export const reportIdFromPath = (pathname: string): string | null => /^\/r\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname)?.[1] ?? null;

export interface CreatedReportLink {
  id: string;
  link: string;
  expiresAt: number;
}

/** Verschlüsselt das Berichtspaket, lädt den Chiffretext hoch und liefert den Link mit dem Schlüssel im Fragment. */
export async function createReportLink(
  o: { origin: string; payload: Uint8Array<ArrayBuffer>; expiresInDays: number; maxViews: number },
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<CreatedReportLink> {
  const id = generateShareId();
  const key = generateShareKey();
  const ciphertext = await encryptReport(key, id, o.payload);
  if (ciphertext.length > SHARE_CIPHERTEXT_MAX_CHARS) throw new ReportLinkError('too-large');
  let res: Response;
  try {
    res = await fetchFn('/api/v1/shares', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ciphertext, expiresInDays: o.expiresInDays, maxViews: o.maxViews }),
    });
  } catch {
    throw new ReportLinkError('offline');
  }
  if (res.status === 401) throw new ReportLinkError('unauthenticated');
  if (res.status === 429) throw new ReportLinkError('rate-limited');
  if (res.status === 413) throw new ReportLinkError('too-large');
  if (!res.ok) throw new ReportLinkError('failed');
  const body = (await res.json()) as { expiresAt: number };
  return { id, link: buildReportLink(o.origin, id, key), expiresAt: body.expiresAt };
}

/** Ansicht: Chiffretext abrufen (zählt einen Aufruf) und mit dem Schlüssel aus dem Fragment öffnen. */
export async function openReportLink(id: string, key: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<{ pkg: ReportPackage; expiresAt: number; viewsLeft: number }> {
  let res: Response;
  try {
    res = await fetchFn(`/api/v1/shares/${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new ReportLinkError('offline');
  }
  if (res.status === 404) throw new ReportLinkError('not-found');
  if (res.status === 410) {
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new ReportLinkError(code === 'revoked' || code === 'exhausted' ? code : 'expired');
  }
  if (res.status === 429) throw new ReportLinkError('rate-limited');
  if (!res.ok) throw new ReportLinkError('failed');
  const body = (await res.json()) as { ciphertext: string; expiresAt: number; viewsLeft: number };
  let plain: Uint8Array;
  try {
    plain = await decryptReport(key, id, body.ciphertext);
  } catch {
    throw new ReportLinkError('bad-key');
  }
  try {
    return { pkg: decodeReportPackage(plain), expiresAt: body.expiresAt, viewsLeft: body.viewsLeft };
  } catch {
    throw new ReportLinkError('bad-package');
  }
}

/** Eigene Arzt-Links mit Aufrufen und Status (EXP-24). */
export async function listReportLinks(fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<ShareInfo[]> {
  let res: Response;
  try {
    res = await fetchFn('/api/v1/shares', { credentials: 'include', cache: 'no-store' });
  } catch {
    throw new ReportLinkError('offline');
  }
  if (res.status === 401) throw new ReportLinkError('unauthenticated');
  if (!res.ok) throw new ReportLinkError('failed');
  return sharesListResponseSchema.parse(await res.json()).shares;
}

/** Widerruft einen Link; danach meldet die Ansicht „widerrufen“ (410). */
export async function revokeReportLink(id: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<void> {
  let res: Response;
  try {
    res = await fetchFn(`/api/v1/shares/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include', cache: 'no-store' });
  } catch {
    throw new ReportLinkError('offline');
  }
  if (res.status === 401) throw new ReportLinkError('unauthenticated');
  if (res.status === 404) throw new ReportLinkError('not-found');
  if (!res.ok) throw new ReportLinkError('failed');
}
