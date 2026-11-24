// ESLint-Konfiguration v3. Abhängigkeitsregeln aus Spec 01 (siehe DECISIONS.md A-008).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { loadRegister } from './scripts/check-ui-components.mjs';

const UI_AND_RUNTIME = ['react', 'react-dom', 'dexie', 'fastify', 'better-sqlite3'];
const pkgImport = (name) => ({ group: [name, `${name}/*`], message: `packages/* dürfen ${name} nicht importieren (Spec 01).` });
const internal = (pkg) => ({ group: [`@stb/${pkg}`, `@stb/${pkg}/*`], message: `Abhängigkeit auf @stb/${pkg} ist hier nicht erlaubt (Spec 01).` });
const runtimeBans = UI_AND_RUNTIME.map(pkgImport);
const APPS = ['web', 'server', 'mcp'];
const appBans = APPS.map((a) => ({ group: [`@stb/${a}`, `@stb/${a}/*`, `**/apps/${a}/**`], message: 'apps/* importieren nie einander (Spec 01).' }));
const PACKAGES = ['core', 'crypto', 'sync-protocol', 'analysis', 'export', 'llm', 'client-sdk'];

/** Erlaubte interne Abhängigkeiten je Paket (Spec 01). */
const ALLOWED = {
  core: [],
  crypto: ['core'],
  'sync-protocol': ['core'],
  analysis: ['core'],
  export: ['core', 'analysis'],
  llm: ['core'],
  'client-sdk': ['core', 'crypto', 'sync-protocol'],
};

/** ARC-07: Das Anthropic-SDK nur in packages/llm und im Server; die Web-App kennt weder SDK noch @stb/llm. */
const sdkBan = pkgImport('@anthropic-ai/sdk');
const webLlmBans = [sdkBan, internal('llm')];

const packageBlocks = PACKAGES.map((pkg) => ({
  files: [`packages/${pkg}/**/*.{ts,tsx,js,mjs}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        ...runtimeBans,
        ...(pkg === 'llm' ? [] : [sdkBan]),
        ...appBans,
        ...PACKAGES.filter((p) => p !== pkg && !ALLOWED[pkg].includes(p)).map(internal),
      ],
    }],
  },
}));

/** UI-33 (Spec 10, A-147): Register „nur shadcn“ — erlaubte HTML-Elemente und UI-Pakete stehen in spec/ui-components.json. */
const UI_REGISTER = loadRegister();
const ALLOWED_ELEMENTS = Object.entries(UI_REGISTER.elements).flatMap(([key, group]) =>
  key === 'neutral' ? group : key.startsWith('$') ? [] : group.list,
);
/** Pakete, die nur components/ui/ importieren darf (Radix, react-day-picker, …). */
const UI_ONLY_BANS = Object.entries(UI_REGISTER.dependencies)
  .filter(([, d]) => d.kind === 'ui-only')
  .map(([name]) => ({ group: [name, `${name}/*`], message: `${name} nur in components/ui/ — shadcn-Komponente verwenden (Spec 10, UI-33).` }));

/** UI-01/UI-33 (Spec 10): außerhalb von components/ui/ nur registrierte HTML-Elemente (Whitelist), kein Inline-CSS. */
const UI_BASE_ELEMENTS = [
  {
    selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]:not([name.name=/^(${ALLOWED_ELEMENTS.join('|')})$/])`,
    message: 'Nur shadcn/ui: dieses HTML-Element ist nicht freigegeben — shadcn-Komponente aus components/ui/ verwenden oder Ausnahme mit User-Freigabe ins Register spec/ui-components.json (Spec 10, UI-01, UI-33).',
  },
  { selector: "JSXAttribute[name.name='style']", message: 'Kein Inline-CSS — Tailwind-Klassen/Tokens verwenden (Spec 10, UI-01).' },
  {
    selector: "JSXAttribute[name.name='type'] Literal[value=/^(date|datetime-local|month|week)$/]",
    message: 'Keine nativen Datums-Picker — shadcn-Datepicker aus components/ui/date-picker verwenden (Spec 10, UI-24, A-146).',
  },
];

/** UI-07 (Spec 10): sichtbarer Text und textuelle Attribute müssen aus i18n/de.ts kommen. */
const UI_HARDCODED_TEXT = [
  { selector: 'JSXText[value=/\\p{L}/u]', message: 'Kein hart codierter UI-Text — Text aus i18n/de.ts verwenden (Spec 10, UI-07).' },
  {
    selector: 'JSXAttribute[name.name=/^(title|placeholder|alt|label|aria-label|aria-description)$/] > Literal',
    message: 'Kein hart codierter UI-Text in Attributen — Text aus i18n/de.ts verwenden (Spec 10, UI-07).',
  },
];

/** Komponenten greifen nur über Repositories auf Daten zu (Spec 01). */
const COMPONENT_BANS = [
  { group: ['dexie', 'dexie/*'], message: 'Komponenten greifen nur über data/repositories/* auf Daten zu (Spec 01).' },
  { group: ['**/data/db', '**/data/db.*', '**/data/db/**'], message: 'Komponenten greifen nur über data/repositories/* auf Daten zu (Spec 01).' },
  ...appBans.filter((_, i) => APPS[i] !== 'web'),
  ...webLlmBans,
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.tsbuild/**', 'reports/**', 'fixtures/**', 'design/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['packages/**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Date', property: 'now', message: 'Clock aus @stb/core injizieren (Spec 12, QA-06).' },
        { object: 'Math', property: 'random', message: 'Random aus @stb/core injizieren (Spec 12, QA-06).' },
      ],
      'no-restricted-globals': ['error',
        { name: 'window', message: 'Keine DOM-APIs in packages/* (Spec 01).' },
        { name: 'document', message: 'Keine DOM-APIs in packages/* (Spec 01).' },
        { name: 'localStorage', message: 'Keine DOM-APIs in packages/* (Spec 01).' },
        { name: 'indexedDB', message: 'Keine DOM-APIs in packages/* (Spec 01).' },
      ],
    },
  },
  ...packageBlocks,
  ...APPS.map((app) => ({
    files: [`apps/${app}/**/*.{ts,tsx,js,mjs}`],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...appBans.filter((_, i) => APPS[i] !== app), ...(app === 'web' ? [...webLlmBans, ...UI_ONLY_BANS] : [])] }],
    },
  })),
  {
    // Service-Worker-Vorlage läuft im Worker-Kontext, nicht in Node.
    files: ['apps/web/sw/*.template.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker, __ASSET_LIST__: 'readonly' } },
  },
  {
    files: ['apps/web/src/components/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...COMPONENT_BANS, ...UI_ONLY_BANS] }] },
  },
  // UI-33: components/ui/ (shadcn) darf die UI-Pakete (Radix u. a.) importieren.
  {
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: COMPONENT_BANS }] },
  },
  // UI-01: Basis-Elemente und Inline-Styles nur in components/ui/ (shadcn), sonst shadcn-Komponenten verwenden.
  {
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/components/ui/**'],
    rules: { 'no-restricted-syntax': ['error', ...UI_BASE_ELEMENTS] },
  },
  // UI-07: kein hart codierter UI-Text in components/** und pages/** — Texte aus i18n/de.ts.
  {
    files: ['apps/web/src/components/**/*.tsx', 'apps/web/src/pages/**/*.tsx'],
    ignores: ['apps/web/src/components/ui/**'],
    rules: { 'no-restricted-syntax': ['error', ...UI_BASE_ELEMENTS, ...UI_HARDCODED_TEXT] },
  },
);
