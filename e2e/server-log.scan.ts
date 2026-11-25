// QA-07: Nach einem vollständigen E2E-Durchlauf enthalten die Server-Logs keine Klartext-Marker und keine Request-Bodies.
// Läuft wie CRY-15 als Playwright-Projekt `server-scan` nach allen anderen Tests.
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const LOG = fileURLToPath(new URL('../reports/e2e-server/server.log', import.meta.url));
const MARKERS = ['STB-E2E-MARKER', 'STB-V2-MARKER', 'STB-PLAINTEXT-MARKER', 'Schmerzstärke', 'Notizen', 'Mein Tagebuch', 'data:image', 'Siri'];

test('QA-07: Server-Logs eines vollständigen E2E-Laufs enthalten keine Klartext-Marker und keine Request-Bodies', () => {
  expect(existsSync(LOG), 'Server-Log fehlt').toBe(true);
  const raw = readFileSync(LOG, 'utf8');
  const lines = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
  // Der Scan muss echte Anfragen sehen (Sync, Konto, Blobs)
  expect(lines.length).toBeGreaterThan(50);
  expect(raw).toContain('/api/v1/sync/push');
  expect(MARKERS.filter((m) => raw.includes(m))).toEqual([]);
  // keine Bodies, keine Header (Cookies, Tokens), keine Chiffretexte
  const forbidden = ['body', 'payload', 'ciphertext', 'headers', 'cookie', 'authorization'];
  const keys = new Set(lines.flatMap((l) => [...Object.keys(l), ...Object.keys((l.req as object) ?? {}), ...Object.keys((l.res as object) ?? {})]).map((k) => k.toLowerCase()));
  expect(forbidden.filter((k) => keys.has(k))).toEqual([]);
  expect(raw).not.toMatch(/stb3?_session=|Bearer /);
});
