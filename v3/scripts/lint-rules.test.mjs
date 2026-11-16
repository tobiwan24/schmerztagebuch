// Regeltests für die ESLint-Abhängigkeitsregeln (Spec 01, Spec 12).
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root });

/** Lintet eine Fixture-Datei so, als läge sie unter `asPath`. → Liste der verletzten Regeln. */
async function rulesFor(fixture, asPath) {
  const code = readFileSync(join(root, 'fixtures', 'lint', fixture), 'utf8');
  const [res] = await eslint.lintText(code, { filePath: join(root, asPath) });
  return res.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe('ESLint-Abhängigkeitsregeln', () => {
  it('ARC-02: react-Import in packages/* lässt lint fehlschlagen', async () => {
    expect(await rulesFor('imports-react.ts', 'packages/core/src/fixture.ts')).toContain('no-restricted-imports');
    expect(await rulesFor('imports-react.ts', 'packages/analysis/src/fixture.ts')).toContain('no-restricted-imports');
  });

  it('ARC-02: dexie-Import in packages/* lässt lint fehlschlagen', async () => {
    expect(await rulesFor('imports-dexie.ts', 'packages/crypto/src/fixture.ts')).toContain('no-restricted-imports');
  });

  it('ARC-02: unerlaubte interne Abhängigkeit (crypto → analysis) schlägt fehl, core-Import ist erlaubt', async () => {
    expect(await rulesFor('crypto-imports-analysis.ts', 'packages/crypto/src/fixture.ts')).toContain('no-restricted-imports');
    expect(await rulesFor('crypto-imports-analysis.ts', 'packages/export/src/fixture.ts')).toEqual([]);
    expect(await rulesFor('clean.ts', 'packages/crypto/src/fixture.ts')).toEqual([]);
  });

  it('ARC-03: direkter Dexie-Zugriff aus apps/web/src/components/** lässt lint fehlschlagen', async () => {
    expect(await rulesFor('component-dexie.tsx', 'apps/web/src/components/Fixture.tsx')).toContain('no-restricted-imports');
    expect(await rulesFor('component-db-module.tsx', 'apps/web/src/components/Fixture.tsx')).toContain('no-restricted-imports');
  });

  it('ARC-03: Zugriff über data/repositories/* ist in Komponenten erlaubt', async () => {
    expect(await rulesFor('component-repository.tsx', 'apps/web/src/components/Fixture.tsx')).toEqual([]);
  });

  it('ARC-06: `any` in packages/* ist ein Lint-Fehler (no-explicit-any = error)', async () => {
    expect(await rulesFor('explicit-any.ts', 'packages/core/src/fixture.ts')).toContain('@typescript-eslint/no-explicit-any');
  });

  it('QA-06: Date.now() und Math.random() in packages/* sind Lint-Fehler', async () => {
    expect(await rulesFor('date-now.ts', 'packages/core/src/fixture.ts')).toContain('no-restricted-properties');
    expect(await rulesFor('math-random.ts', 'packages/sync-protocol/src/fixture.ts')).toContain('no-restricted-properties');
    expect(await rulesFor('date-now.ts', 'apps/server/src/fixture.ts')).toEqual([]);
  });

  it('ARC-07: llm darf nur core importieren; das Anthropic-SDK nur in packages/llm und im Server', async () => {
    expect(await rulesFor('crypto-imports-analysis.ts', 'packages/llm/src/fixture.ts')).toContain('no-restricted-imports');
    expect(await rulesFor('clean.ts', 'packages/llm/src/fixture.ts')).toEqual([]);
    expect(await rulesFor('imports-anthropic.ts', 'packages/llm/src/fixture.ts')).toEqual([]);
    expect(await rulesFor('imports-anthropic.ts', 'packages/core/src/fixture.ts')).toContain('no-restricted-imports');
    expect(await rulesFor('imports-anthropic.ts', 'apps/server/src/fixture.ts')).toEqual([]);
    expect(await rulesFor('imports-anthropic.ts', 'apps/web/src/fixture.ts')).toContain('no-restricted-imports');
    expect(await rulesFor('imports-anthropic.ts', 'apps/web/src/components/Fixture.tsx')).toContain('no-restricted-imports');
  });

  it('ARC-07: @stb/llm ist in der Web-App verboten, im Server erlaubt', async () => {
    expect(await rulesFor('imports-llm.ts', 'apps/web/src/fixture.ts')).toContain('no-restricted-imports');
    expect(await rulesFor('imports-llm.ts', 'apps/web/src/components/Fixture.tsx')).toContain('no-restricted-imports');
    expect(await rulesFor('imports-llm.ts', 'apps/server/src/fixture.ts')).toEqual([]);
  });
});
