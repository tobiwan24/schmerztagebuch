// CSP-Quelle (`apps/web/csp.ts`) und nginx-Konfiguration stimmen überein (Spec 12 „Sicherheit", QA-04).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentSecurityPolicy, SECURITY_HEADERS_BASE } from '../../apps/web/csp.js';

const nginx = readFileSync(join(import.meta.dirname, '../../apps/web/nginx.conf'), 'utf8');
const header = (name: string) => new RegExp(`add_header ${name} "([^"]+)" always;`).exec(nginx)?.[1];

describe('CSP', () => {
  it('QA-04: nginx setzt dieselbe CSP wie die Vorschau, ohne unsafe-inline/unsafe-eval, plus Sicherheits-Header', () => {
    const csp = contentSecurityPolicy();
    expect(header('Content-Security-Policy')).toBe(csp);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    for (const [k, v] of Object.entries(SECURITY_HEADERS_BASE)) expect(header(k), k).toBe(v);
    // keine add_header-Zeilen in locations (sonst entfallen dort die Server-Header)
    const inLocation = [...nginx.matchAll(/^\s*location[^{]*\{([^}]*)\}/gm)].some((m) => m[1]!.includes('add_header'));
    expect(inLocation).toBe(false);
    expect(contentSecurityPolicy(['https://v2.example'])).toContain('connect-src \'self\' https://api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com https://v2.example');
  });
});
