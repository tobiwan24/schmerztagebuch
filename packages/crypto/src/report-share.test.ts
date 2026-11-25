import { describe, it, expect } from 'vitest';
import { buildReportLink, decryptReport, encryptReport, generateShareId, generateShareKey, parseReportKey } from './report-share.js';

const text = (s: string) => new TextEncoder().encode(s);

describe('Arzt-Link Krypto', () => {
  it('EXP-21: Roundtrip, Fehler bei falschem Schlüssel, falscher AAD und manipuliertem Chiffretext', async () => {
    const id = generateShareId();
    const key = generateShareKey();
    const ct = await encryptReport(key, id, text('{"marker":"STB-REPORT-MARKER-7"}'));
    expect(ct).not.toContain('STB-REPORT');
    expect(new TextDecoder().decode(await decryptReport(key, id, ct))).toContain('STB-REPORT-MARKER-7');
    await expect(decryptReport(generateShareKey(), id, ct)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(decryptReport(key, generateShareId(), ct)).rejects.toMatchObject({ code: 'decrypt-failed' });
    const tampered = ct.slice(0, -2) + (ct.endsWith('AA') ? 'BB' : 'AA');
    await expect(decryptReport(key, id, tampered)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(decryptReport(key, id, 'AAAA')).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(decryptReport('kurz', id, ct)).rejects.toMatchObject({ code: 'malformed-envelope' });
  });

  it('EXP-21: der Schlüssel steht nur im Fragment, nie im Request-Teil des Links oder im Chiffretext', async () => {
    const id = generateShareId();
    const key = generateShareKey();
    const link = buildReportLink('https://stb.example/', id, key);
    const url = new URL(link);
    expect(url.pathname).toBe(`/r/${id}`);
    expect(`${url.origin}${url.pathname}${url.search}`).not.toContain(key);
    expect(parseReportKey(url.hash)).toBe(key);
    expect(parseReportKey('#k=zu-kurz')).toBeNull();
    expect(await encryptReport(key, id, text('x'))).not.toContain(key);
  });
});
