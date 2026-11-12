import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests nutzen die Quellen der Workspace-Pakete, nicht ein ggf. veraltetes dist/.
    alias: {
      '@stb/core': src('core'),
      '@stb/crypto': src('crypto'),
      '@stb/sync-protocol': src('sync-protocol'),
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}', 'integration/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
    reporters: ['default', 'json'],
    outputFile: { json: 'reports/vitest.json' },
    // Der Frischer-Checkout-Test (ARC-01) startet einen zweiten Vitest-Lauf, während der äußere noch läuft. Unter dieser
    // Doppellast stürzten Worker des inneren Laufs ab (ERR_IPC_CHANNEL_CLOSED) — daher dort nur wenige parallele Worker.
    ...(process.env.STB_FRESH_CHECKOUT === '1' ? { poolOptions: { forks: { maxForks: 2, minForks: 1 } } } : {}),
  },
});
