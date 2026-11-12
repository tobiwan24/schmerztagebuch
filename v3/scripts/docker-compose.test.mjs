// QA-08: `docker compose up` startet Web und Server; Health-Endpunkt antwortet mit Version.
// Läuft nur mit erreichbarem Docker-Daemon. Ohne Docker wird der Test übersprungen — check-acceptance wertet
// übersprungene Tests NICHT als erfüllt, QA-08 bleibt dann offen.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'stb-v3-qa08';
const PORT = '18080';

function dockerAvailable() {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

const skip = process.env.STB_FRESH_CHECKOUT === '1' || !dockerAvailable();
const compose = (...args) =>
  execFileSync('docker', ['compose', '-p', PROJECT, ...args], { cwd: root, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, WEB_PORT: PORT } });

async function waitForHealth(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Health nicht erreichbar: ${last}`);
}

describe('Docker', () => {
  it.skipIf(skip)('QA-08: docker compose up startet Web und Server; Health antwortet über das Web mit Version', async () => {
    try {
      compose('up', '-d', '--build');
      const body = await waitForHealth(`http://127.0.0.1:${PORT}/api/v1/health`, 120_000);
      expect(body).toMatchObject({ db: true });
      expect(body.version).toMatch(/^3\.0\.0/);
      const page = await fetch(`http://127.0.0.1:${PORT}/`);
      expect(page.status).toBe(200);
    } finally {
      compose('down', '-v');
    }
  }, 900_000);
});
