import { describe, it, expect } from 'vitest';
import { parseReportKey } from '@stb/crypto';
import { createReportLink, listReportLinks, openReportLink, revokeReportLink } from './report-link';
import { decodeReportPackage, encodeReportPackage, pdfBytes } from './report-package';
import type { Report } from '@stb/export';

const report = { title: 'Bericht', tables: [], stats: [], chart: null } as unknown as Report;
const PDF = new TextEncoder().encode('%PDF-1.7 STB-PLAINTEXT-MARKER %%EOF');

/** Minimaler Server: speichert den Chiffretext, hält alle Anfragen fest. */
function fakeServer() {
  const requests: string[] = [];
  let stored: { id: string; ciphertext: string } | null = null;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`);
    if (init?.method === 'POST') {
      stored = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ expiresAt: 123 }), { status: 201 });
    }
    return new Response(JSON.stringify({ ciphertext: stored!.ciphertext, expiresAt: 123, viewsLeft: 4 }), { status: 200 });
  }) as typeof fetch;
  return { requests, fetchFn };
}

describe('Arzt-Link im Client', () => {
  it('Erstellen: Link trägt den Schlüssel nur im Fragment, Anfragen enthalten ihn und den Klartext nie; Öffnen ergibt das Paket', async () => {
    const srv = fakeServer();
    const created = await createReportLink({ origin: 'https://stb.example', payload: encodeReportPackage(report, PDF), expiresInDays: 14, maxViews: 5 }, srv.fetchFn);
    const url = new URL(created.link);
    const key = parseReportKey(url.hash)!;
    expect(key).toHaveLength(43);
    expect(url.pathname).toBe(`/r/${created.id}`);
    expect(srv.requests).toHaveLength(1);
    expect(srv.requests[0]).toContain('POST /api/v1/shares');
    expect(srv.requests[0]).not.toContain(key);
    expect(srv.requests[0]).not.toContain('STB-PLAINTEXT-MARKER');

    const opened = await openReportLink(created.id, key, srv.fetchFn);
    expect(srv.requests[1]).toBe(`GET /api/v1/shares/${created.id} `);
    expect(srv.requests.join('\n')).not.toContain(key);
    expect(opened.viewsLeft).toBe(4);
    expect(new TextDecoder().decode(pdfBytes(opened.pkg))).toContain('STB-PLAINTEXT-MARKER');
    await expect(openReportLink(created.id, 'A'.repeat(43), srv.fetchFn)).rejects.toMatchObject({ code: 'bad-key' });
  });

  it('Fehler werden unterscheidbar gemeldet (401, 429, offline, 410 je Grund, 404, kaputtes Paket)', async () => {
    const respond = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const payload = encodeReportPackage(report, PDF);
    const opts = { origin: 'https://x', payload, expiresInDays: 1, maxViews: 1 };
    await expect(createReportLink(opts, respond(401))).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(createReportLink(opts, respond(429))).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(createReportLink(opts, respond(500))).rejects.toMatchObject({ code: 'failed' });
    await expect(createReportLink(opts, (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'offline' });
    for (const [error, code] of [['revoked', 'revoked'], ['exhausted', 'exhausted'], ['expired', 'expired']] as const) {
      await expect(openReportLink('A'.repeat(22), 'A'.repeat(43), respond(410, { error }))).rejects.toMatchObject({ code });
    }
    await expect(openReportLink('A'.repeat(22), 'A'.repeat(43), respond(404))).rejects.toMatchObject({ code: 'not-found' });
    expect(() => decodeReportPackage(new TextEncoder().encode('{"v":2}'))).toThrow();
  });

  it('EXP-24: Liste und Widerruf sprechen die richtigen Endpunkte an und melden Fehler unterscheidbar', async () => {
    const calls: string[] = [];
    const info = { id: 'A'.repeat(22), createdAt: 1, expiresAt: 2, maxViews: 5, views: 1, status: 'active' };
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ shares: [info] }), { status: 200 });
    }) as typeof fetch;
    expect(await listReportLinks(fetchFn)).toEqual([info]);
    await revokeReportLink(info.id, fetchFn);
    expect(calls).toEqual(['GET /api/v1/shares', `DELETE /api/v1/shares/${info.id}`]);
    const respond = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(listReportLinks(respond(401))).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(revokeReportLink(info.id, respond(404))).rejects.toMatchObject({ code: 'not-found' });
    await expect(revokeReportLink(info.id, (async () => { throw new TypeError('x'); }) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'offline' });
  });
});
