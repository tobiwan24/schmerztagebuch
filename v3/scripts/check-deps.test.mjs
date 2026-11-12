import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDecisionDeps, findUndocumented } from './check-deps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const decisions = readFileSync(resolve(here, '..', 'fixtures', 'deps', 'DECISIONS.md'), 'utf8');

describe('check-deps.mjs', () => {
  it('QA-11: liest Paketnamen nur aus dem Abschnitt „Abhängigkeiten"', () => {
    expect([...parseDecisionDeps(decisions)]).toEqual(['zod', 'vitest']);
  });

  it('QA-11: meldet undokumentierte Abhängigkeiten, ignoriert interne @stb/*-Workspaces', () => {
    const manifests = [
      { path: 'package.json', json: { devDependencies: { vitest: '^3' } } },
      { path: 'packages/core/package.json', json: { dependencies: { zod: '^3', '@stb/crypto': '*' }, peerDependencies: { react: '^19' } } },
    ];
    expect(findUndocumented(manifests, decisions)).toEqual([{ pkg: 'packages/core/package.json', name: 'react' }]);
    expect(findUndocumented(manifests.slice(0, 1), decisions)).toEqual([]);
  });

  it('QA-11: das echte Repo hat keine undokumentierten Abhängigkeiten', () => {
    const out = execFileSync(process.execPath, [join(here, 'check-deps.mjs')], { encoding: 'utf8' });
    expect(out).toContain('✓');
  });
});
