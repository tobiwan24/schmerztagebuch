// Abdeckungsgrenzen (Spec 12 „Abdeckung"): in der Vitest-Konfiguration hinterlegt und bei jedem `npm test` (→ verify) erzwungen.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import config, { COVERAGE_THRESHOLDS } from '../../vitest.config.js';

const root = join(import.meta.dirname, '../..');

describe('Abdeckung', () => {
  it('QA-01: Abdeckungsgrenzen aus Spec 12 werden erzwungen (Vitest thresholds, npm test misst immer mit)', () => {
    expect(COVERAGE_THRESHOLDS).toEqual({
      'packages/core/src/**': { lines: 90, branches: 90 },
      'packages/crypto/src/**': { lines: 90, branches: 90 },
      'packages/sync-protocol/src/**': { lines: 90, branches: 90 },
      'packages/analysis/src/**': { lines: 85, branches: 85 },
      'packages/export/src/**': { lines: 85, branches: 85 },
      'packages/llm/src/**': { lines: 85, branches: 85 },
    });
    const coverage = (config as { test?: { coverage?: { thresholds?: unknown; provider?: string } } }).test?.coverage;
    expect(coverage?.provider).toBe('v8');
    expect(coverage?.thresholds).toBe(COVERAGE_THRESHOLDS);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toContain('--coverage');
    expect(pkg.scripts.verify).toContain('npm run test');
  });
});
