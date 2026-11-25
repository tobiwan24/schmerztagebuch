// UI-33 (Spec 10, A-147): Register „nur shadcn“ — Ausnahmen nur mit User-Freigabe, keine Umgehung per eslint-disable.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUiRegister, collect, hasUserApproval, loadRegister } from './check-ui-components.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DECISIONS = '| A-900 | Etwas. Freigabe User 2026-11-24. | x |\n| A-901 | Vom Loop entschieden. | x |';
const base = () => ({
  register: {
    components: { button: { source: 'shadcn', doc: 'https://ui.shadcn.com/docs/components/radix/button' } },
    elements: { neutral: ['div'], structural: { approval: 'A-900', list: ['a'] }, temporary: { list: [] } },
    dependencies: { react: { kind: 'frei' } },
  },
  uiFiles: ['button'],
  deps: ['react', '@stb/core'],
  decisions: DECISIONS,
  sources: [{ path: 'apps/web/src/x.tsx', text: 'export const x = 1;' }],
});

describe('UI-33: Register nur shadcn', () => {
  it('UI-33: vollständiges Register ohne Ausnahmen ist ok', () => {
    expect(checkUiRegister(base())).toEqual([]);
  });

  it('UI-33: nicht registrierte ui-Datei oder verwaister Eintrag schlägt fehl', () => {
    expect(checkUiRegister({ ...base(), uiFiles: ['button', 'month-picker'] }).join('\n')).toMatch(/month-picker\.tsx steht nicht im Register/);
    expect(checkUiRegister({ ...base(), uiFiles: [] }).join('\n')).toMatch(/„button“ ohne Datei/);
  });

  it('UI-33: Ausnahme nur mit dokumentierter User-Freigabe', () => {
    const withExc = (approval) => {
      const b = base();
      b.register.components.dialog = { source: 'ausnahme', ...(approval ? { approval } : {}) };
      b.uiFiles = ['button', 'dialog'];
      return checkUiRegister(b).join('\n');
    };
    expect(withExc(undefined)).toMatch(/ohne Freigabe/);
    expect(withExc('A-901')).toMatch(/nicht als „Freigabe User/);
    expect(withExc('A-999')).toMatch(/nicht als „Freigabe User/);
    expect(withExc('A-900')).toBe('');
    expect(hasUserApproval(DECISIONS, 'A-900')).toBe(true);
    expect(hasUserApproval(DECISIONS, 'A-901')).toBe(false);
  });

  it('UI-33: neues Paket muss eingeordnet werden; Paket-Ausnahme braucht Freigabe', () => {
    expect(checkUiRegister({ ...base(), deps: ['react', 'vaul'] }).join('\n')).toMatch(/„vaul“ steht nicht im Register/);
    const b = base();
    b.register.dependencies.vaul = { kind: 'ausnahme', approval: 'A-901' };
    b.deps = ['react', 'vaul'];
    expect(checkUiRegister(b).join('\n')).toMatch(/vaul.*Freigabe User/);
  });

  it('UI-33: eslint-disable für die UI-Regeln (oder pauschal) ist verboten', () => {
    const src = (text) => checkUiRegister({ ...base(), sources: [{ path: 'apps/web/src/a.tsx', text }] }).join('\n');
    expect(src('// eslint-disable-next-line no-restricted-syntax\n<button />')).toMatch(/umgeht die UI-Regeln/);
    expect(src('/* eslint-disable */')).toMatch(/umgeht die UI-Regeln/);
    expect(src('// eslint-disable-next-line react-hooks/exhaustive-deps')).toBe('');
  });

  it('UI-33: der echte Bestand erfüllt das Register', () => {
    const errors = checkUiRegister({ register: loadRegister(), decisions: readFileSync(join(root, 'DECISIONS.md'), 'utf8'), ...collect() });
    expect(errors).toEqual([]);
  });
});
