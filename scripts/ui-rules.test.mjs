// UI-01 / UI-07: Lint-Regeln für das UI (Spec 10).
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbiddenCss } from './check-ui-css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root });

async function rulesFor(fixture, asPath) {
  const code = readFileSync(join(root, 'fixtures', 'lint', fixture), 'utf8');
  const [res] = await eslint.lintText(code, { filePath: join(root, asPath) });
  return res.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe('UI-Lint-Regeln', () => {
  it('UI-01: Basis-Elemente (<button> u. a.) nur in components/ui/, sonst Lint-Fehler', async () => {
    expect(await rulesFor('ui-raw-button.tsx', 'apps/web/src/pages/Start.tsx')).toContain('no-restricted-syntax');
    expect(await rulesFor('ui-raw-button.tsx', 'apps/web/src/components/EntryCard.tsx')).toContain('no-restricted-syntax');
    expect(await rulesFor('ui-raw-button.tsx', 'apps/web/src/components/ui/button.tsx')).toEqual([]);
  });

  it('UI-01: Inline-Styles (style-Prop) sind außerhalb von components/ui/ verboten', async () => {
    expect(await rulesFor('ui-style-prop.tsx', 'apps/web/src/pages/Start.tsx')).toContain('no-restricted-syntax');
  });

  it('UI-01: native Datums-Picker (type date/datetime-local/month) sind außerhalb von components/ui/ verboten (A-146)', async () => {
    expect(await rulesFor('ui-native-date.tsx', 'apps/web/src/components/EntryForm.tsx')).toContain('no-restricted-syntax');
    expect(await rulesFor('ui-native-date.tsx', 'apps/web/src/pages/ExportPage.tsx')).toContain('no-restricted-syntax');
  });

  it('UI-33: nur registrierte HTML-Elemente außerhalb von components/ui/ (fieldset, legend, hr … sind verboten)', async () => {
    expect(await rulesFor('ui-raw-element.tsx', 'apps/web/src/pages/Start.tsx')).toContain('no-restricted-syntax');
    expect(await rulesFor('ui-raw-element.tsx', 'apps/web/src/components/EntryForm.tsx')).toContain('no-restricted-syntax');
    expect(await rulesFor('ui-raw-element.tsx', 'apps/web/src/components/ui/field.tsx')).toEqual([]);
    // genehmigte Struktur-Elemente (form, a, img, output) bleiben erlaubt
    expect(await rulesFor('ui-structural-ok.tsx', 'apps/web/src/pages/Start.tsx')).toEqual([]);
  });

  it('UI-33: UI-Pakete (Radix u. a.) nur in components/ui/ importieren', async () => {
    expect(await rulesFor('ui-radix-import.tsx', 'apps/web/src/pages/Start.tsx')).toContain('no-restricted-imports');
    expect(await rulesFor('ui-radix-import.tsx', 'apps/web/src/components/EntryForm.tsx')).toContain('no-restricted-imports');
    expect(await rulesFor('ui-radix-import.tsx', 'apps/web/src/components/ui/tooltip.tsx')).toEqual([]);
  });

  it('UI-01: keine CSS-Datei außer index.css in apps/web/src', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stb-css-'));
    try {
      mkdirSync(join(dir, 'components'), { recursive: true });
      writeFileSync(join(dir, 'index.css'), '');
      expect(findForbiddenCss(dir)).toEqual([]);
      writeFileSync(join(dir, 'components', 'card.module.css'), '');
      expect(findForbiddenCss(dir)).toEqual(['components/card.module.css']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(findForbiddenCss(join(root, 'apps', 'web', 'src'))).toEqual([]);
  });

  it('UI-07: hart codierter Text in components/** und pages/** ist ein Lint-Fehler', async () => {
    expect(await rulesFor('ui-hardcoded-text.tsx', 'apps/web/src/pages/Start.tsx')).toContain('no-restricted-syntax');
    expect(await rulesFor('ui-hardcoded-attr.tsx', 'apps/web/src/components/Logo.tsx')).toContain('no-restricted-syntax');
  });

  it('UI-01 UI-07: shadcn-Komponente mit Texten aus i18n/de.ts ist erlaubt', async () => {
    expect(await rulesFor('ui-ok.tsx', 'apps/web/src/pages/Start.tsx')).toEqual([]);
    expect(await rulesFor('ui-ok.tsx', 'apps/web/src/components/Nav.tsx')).toEqual([]);
  });
});
