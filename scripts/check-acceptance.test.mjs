// Selbsttest für check-acceptance.mjs (ARC-05) mit Fixture-Reports unter fixtures/acceptance/.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs, parseMilestones, parseManualChecks, collectTests, evaluate, checkStructure } from './check-acceptance.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = resolve(here, '..', 'fixtures', 'acceptance');
const read = (p) => readFileSync(join(fx, p), 'utf8');
const json = (p) => JSON.parse(read(p));

function load() {
  const files = readdirSync(join(fx, 'spec')).map((name) => ({ name, content: read(`spec/${name}`) }));
  const { specs, errors } = parseSpecs(files);
  const tests = collectTests(json('reports/vitest.json'), json('reports/playwright.json'));
  return { specs, errors, tests, manualDone: parseManualChecks(read('PROGRESS.md')) };
}

function run(...args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(here, 'check-acceptance.mjs'), '--root', fx, '--json', ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: e.stdout };
  }
}

describe('check-acceptance.mjs', () => {
  it('ARC-05: ID ohne Test wird als fehlend, ID mit bestandenem Test als erfüllt gemeldet', () => {
    const { specs, errors, tests, manualDone } = load();
    expect(errors).toEqual([]);
    const r = evaluate({ specs, ids: [...specs.keys()], tests, manualDone });
    expect(r.passed).toEqual(['XYZ-01']);
    expect(r.missing).toEqual([
      { id: 'XYZ-02', reason: 'kein Test' },
      { id: 'XYZ-05', reason: 'nur übersprungene Tests' },
    ]);
  });

  it('ARC-05: ein fehlgeschlagener Test macht die ID rot, auch wenn ein anderer bestanden hat', () => {
    const { specs, tests, manualDone } = load();
    expect(evaluate({ specs, ids: ['XYZ-03'], tests, manualDone }).failed).toEqual(['XYZ-03']);
  });

  it('ARC-05: manuelle IDs zählen nur abgehakt; unbekannte Test-IDs werden gemeldet', () => {
    const { specs, tests } = load();
    const open = evaluate({ specs, ids: ['XYZ-04'], tests, manualDone: new Set() });
    expect(open.manualOpen).toEqual(['XYZ-04']);
    const done = evaluate({ specs, ids: ['XYZ-04'], tests, manualDone: parseManualChecks('- [x] XYZ-04 ok') });
    expect(done.manualDone).toEqual(['XYZ-04']);
    expect(open.unknownInTests).toEqual(['QQQ-99']);
  });

  it('ARC-05: Struktur meldet doppelte und nicht zugeordnete IDs', () => {
    const { specs } = load();
    const ms = parseMilestones(read('MILESTONES.md'));
    expect(checkStructure(specs, ms, new Set(['XYZ-04']))).toEqual([]);
    ms.get('M1').add('XYZ-01');
    ms.get('M1').delete('XYZ-02');
    const errs = checkStructure(specs, ms, new Set());
    expect(errs).toContain('XYZ-01 steht in M0 und M1');
    expect(errs.some((e) => e.startsWith('XYZ-02'))).toBe(true);
    expect(errs).toContain('manuelle ID XYZ-04 keinem Gate zugeordnet');
    const dup = parseSpecs([{ name: 'a.md', content: '| XYZ-01 | a | unit |' }, { name: 'b.md', content: '| XYZ-01 | b | unit |' }]);
    expect(dup.errors).toHaveLength(1);
  });

  it('ARC-05: CLI liefert Exit 0 für erfüllten Meilenstein und Exit 1 für unerfüllten', () => {
    const ok = run('--milestone', 'M0');
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out).passed).toEqual(['XYZ-01']);
    const bad = run('--milestone', 'M1');
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out).ok).toBe(false);
  });
});
