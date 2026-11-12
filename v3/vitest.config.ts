import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests nutzen die Quellen der Workspace-Pakete, nicht ein ggf. veraltetes dist/.
    alias: {
      '@stb/core': src('core'),
      '@stb/crypto': src('crypto'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
    reporters: ['default', 'json'],
    outputFile: { json: 'reports/vitest.json' },
  },
});
