import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('TypeScript-Konfiguration', () => {
  it('ARC-06: tsconfig.base.json erzwingt strict und noUncheckedIndexedAccess', () => {
    const { compilerOptions } = readJson('tsconfig.base.json');
    expect(compilerOptions.strict).toBe(true);
    expect(compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it('ARC-06: jedes Paket erbt von tsconfig.base.json und schaltet strict nicht ab', () => {
    const dirs = ['packages', 'apps'].filter((d) => existsSync(join(root, d)))
      .flatMap((d) => readdirSync(join(root, d)).map((n) => `${d}/${n}`))
      .filter((d) => existsSync(join(root, d, 'tsconfig.json')));
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) {
      const cfg = readJson(`${d}/tsconfig.json`);
      expect(cfg.extends, d).toMatch(/tsconfig\.base\.json$/);
      expect(cfg.compilerOptions?.strict, d).not.toBe(false);
      expect(cfg.compilerOptions?.noUncheckedIndexedAccess, d).not.toBe(false);
    }
  });
});
