// Build- und Abhängigkeits-Prüfungen (Spec 12): Bundle-Budget, Versionsgleichheit SW ↔ App, npm audit.
import { describe, expect, it } from 'vitest';
import { exec } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
// @ts-expect-error — reines JS-Skript ohne Typen
import { analyze, INITIAL_JS_BUDGET, versions } from '../../scripts/check-bundle.mjs';

const run = promisify(exec);
const root = join(import.meta.dirname, '../..');

describe('Build', () => {
  // Im Frischer-Checkout-Kindlauf (ARC-01) übersprungen: dort baut `verify` ohnehin und prüft das Budget.
  it.skipIf(process.env.STB_FRESH_CHECKOUT === '1')('QA-02 QA-10: initiales JS ≤ 250 KB gzip; Service Worker und App melden dieselbe Version aus version.ts', async () => {
    const out = mkdtempSync(join(tmpdir(), 'stb-build-'));
    try {
      await run(`npx vite build --outDir "${out}" --emptyOutDir --logLevel error`, { cwd: join(root, 'apps/web'), maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NODE_ENV: 'production' } });
      const { total, files } = analyze(out) as { total: number; files: { file: string }[] };
      expect(files.length).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(INITIAL_JS_BUDGET);
      // schwere Teile sind ausgelagert (Spec 12 „Budgets")
      expect(files.map((f) => f.file).join(' ')).not.toMatch(/AnalysisPage|ExportPage|MigratePage|TemplatesPage|useBackup/);
      const v = versions(out, join(root, 'apps/web/src/version.ts')) as { app: string; sw: string };
      expect(v.app).toMatch(/^3\.\d+\.\d+-alpha\.\d+$/);
      expect(v.sw).toBe(v.app);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 240_000);

  it('QA-05: npm audit --omit=dev meldet keine high/critical-Lücken', async () => {
    const { stdout } = await run('npm audit --omit=dev --json', { cwd: root, maxBuffer: 20 * 1024 * 1024 }).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? '{}' }));
    const report = JSON.parse(stdout) as { metadata?: { vulnerabilities?: Record<string, number> } };
    const v = report.metadata?.vulnerabilities;
    expect(v, 'npm audit lieferte keinen Bericht (Netz?)').toBeDefined();
    expect({ high: v!.high, critical: v!.critical }).toEqual({ high: 0, critical: 0 });
  }, 120_000);
});
