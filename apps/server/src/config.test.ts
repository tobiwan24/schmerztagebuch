import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseEnvFile, ConfigError } from './config.js';
import { startServer, type RunningServer } from './main.js';

const example = parseEnvFile(readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8'));

let running: RunningServer | undefined;
let dir: string | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('Server-Konfiguration', () => {
  it('ARC-04: fehlt RP_ID, startet der Server nicht und meldet die fehlende Variable', async () => {
    const { RP_ID: _, ...env } = example;
    void _;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/RP_ID/);
    await expect(startServer(env)).rejects.toThrow(/RP_ID/);
  });

  it('ARC-04: alle fehlenden/ungültigen Variablen werden gemeinsam gemeldet', () => {
    try {
      loadConfig({ ALLOWED_ORIGINS: 'kein-url' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as Error).message;
      for (const v of ['RP_ID', 'ALLOWED_ORIGINS', 'DATABASE_PATH', 'BLOB_DIR']) expect(msg).toContain(v);
    }
  });

  it('ARC-04: .env.example dokumentiert alle Variablen und ist gültig', () => {
    expect(Object.keys(example)).toEqual(expect.arrayContaining(['RP_ID', 'ALLOWED_ORIGINS', 'DATABASE_PATH', 'BLOB_DIR']));
    const cfg = loadConfig(example);
    expect(cfg.allowedOrigins).toEqual(['http://localhost:5173']);
  });

  it('ARC-04: startet mit gültiger .env.example-Konfiguration; Health antwortet mit Version', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stb-server-'));
    running = await startServer({ ...example, PORT: '0', HOST: '127.0.0.1' }, { cwd: dir });
    const res = await fetch(`${running.url}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; db: boolean };
    expect(body.db).toBe(true);
    expect(body.version).toMatch(/^3\.0\.0/);
    expect(existsSync(join(dir, 'data', 'blobs'))).toBe(true);
  });

  it('ARC-04: parseEnvFile ignoriert Kommentare/Leerzeilen und entfernt Anführungszeichen', () => {
    expect(parseEnvFile('# x\n\nA=1\nB="zwei drei"\n C = 4 \n')).toEqual({ A: '1', B: 'zwei drei', C: '4' });
  });
});

describe('Rate-Limits', () => {
  it('Standard 30/min und 5 je 15 min; per Umgebung änderbar, ungültige Werte abgelehnt', () => {
    const base = { RP_ID: 'localhost', ALLOWED_ORIGINS: 'http://localhost:5173', DATABASE_PATH: 'x.db', BLOB_DIR: 'b' };
    expect(loadConfig(base).rateLimits).toEqual({ authPerMinute: 30, recoveryPer15Min: 5 });
    expect(loadConfig({ ...base, AUTH_RATE_LIMIT_PER_MIN: '100', RECOVERY_RATE_LIMIT_PER_15MIN: '9' }).rateLimits).toEqual({ authPerMinute: 100, recoveryPer15Min: 9 });
    expect(() => loadConfig({ ...base, RECOVERY_RATE_LIMIT_PER_15MIN: '0' })).toThrow();
  });
});

