// ARC-01: `npm run verify` läuft in einem frischen Checkout nach `npm ci` durch.
// Kopiert alle versionierten und nicht ignorierten Dateien des Repos (= Stand eines Checkouts inkl. aktueller Änderungen)
// in ein Temp-Verzeichnis, führt dort `npm ci` und `npm run verify` aus. Im Kind-Lauf wird dieser Test übersprungen
// (STB_FRESH_CHECKOUT=1), sonst würde er sich rekursiv selbst aufrufen.
import { describe, it, expect } from 'vitest';
import { exec, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inChild = process.env.STB_FRESH_CHECKOUT === '1';

function checkoutFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
  return out.split('\0').filter((f) => f && existsSync(join(root, f)));
}

describe('frischer Checkout', () => {
  it.skipIf(inChild)('ARC-01: npm ci + npm run verify laufen im frischen Checkout ohne Fehler durch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stb-v3-fresh-'));
    try {
      const files = checkoutFiles();
      expect(files).toContain('package-lock.json');
      expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
      for (const f of files) {
        mkdirSync(dirname(join(dir, f)), { recursive: true });
        copyFileSync(join(root, f), join(dir, f));
      }
      // Ohne das von Vitest gesetzte NODE_ENV=test — sonst baut Vite im Kind-Lauf die Entwicklungsversion (Bundle-Budget).
      const env = { ...process.env, STB_FRESH_CHECKOUT: '1' };
      delete env.NODE_ENV;
      // Asynchron: `execSync` würde den Worker > 60 s blockieren → Vitest-RPC-Timeout („onTaskUpdate").
      const run = async (cmd) => (await promisify(exec)(cmd, { cwd: dir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout;
      await run('npm ci --prefer-offline --no-audit --no-fund');
      const out = await run('npm run verify');
      expect(out).toContain('Alle Abhängigkeiten in DECISIONS.md dokumentiert');
      expect(existsSync(join(dir, 'reports', 'vitest.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 600_000);
});
