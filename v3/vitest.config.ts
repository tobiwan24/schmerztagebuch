import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

/** Spec 12: core, crypto, sync-protocol ≥ 90 % (Zeilen und Zweige); analysis, export ≥ 85 %. */
export const COVERAGE_THRESHOLDS = {
  'packages/core/src/**': { lines: 90, branches: 90 },
  'packages/crypto/src/**': { lines: 90, branches: 90 },
  'packages/sync-protocol/src/**': { lines: 90, branches: 90 },
  'packages/analysis/src/**': { lines: 85, branches: 85 },
  'packages/export/src/**': { lines: 85, branches: 85 },
  'packages/llm/src/**': { lines: 85, branches: 85 },
};

export default defineConfig({
  resolve: {
    // Tests nutzen die Quellen der Workspace-Pakete, nicht ein ggf. veraltetes dist/.
    alias: {
      '@stb/core': src('core'),
      '@stb/crypto': src('crypto'),
      '@stb/sync-protocol': src('sync-protocol'),
      '@stb/analysis': src('analysis'),
      '@stb/export': src('export'),
      '@stb/llm': src('llm'),
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}', 'integration/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
    reporters: ['default', 'json'],
    // Abdeckungsgrenzen (Spec 12 „Abdeckung", QA-01) — `npm test` misst immer mit, Unterschreiten lässt `verify` scheitern.
    // `all: false`: nur geladene Dateien (unter Windows erzeugte `all` sonst Doppel-Einträge mit anderer Laufwerks-Schreibweise).
    coverage: {
      provider: 'v8',
      all: false,
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.ts', '**/fixture.ts', '**/big-fixture.ts', '**/index.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'reports/coverage',
      thresholds: COVERAGE_THRESHOLDS,
    },
    outputFile: { json: 'reports/vitest.json' },
    // Der Frischer-Checkout-Test (ARC-01) startet einen zweiten Vitest-Lauf, während der äußere noch läuft. Unter dieser
    // Doppellast stürzten Worker des inneren Laufs ab (ERR_IPC_CHANNEL_CLOSED) — daher dort nur wenige parallele Worker.
    ...(process.env.STB_FRESH_CHECKOUT === '1' ? { poolOptions: { forks: { maxForks: 2, minForks: 1 } } } : {}),
  },
});
