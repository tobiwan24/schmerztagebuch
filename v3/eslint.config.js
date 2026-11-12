// ESLint-Konfiguration v3. Abhängigkeitsregeln aus Spec 01 (siehe DECISIONS.md A-008).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const UI_AND_RUNTIME = ['react', 'react-dom', 'dexie', 'fastify', 'better-sqlite3'];
const pkgImport = (name) => ({ group: [name, `${name}/*`], message: `packages/* dürfen ${name} nicht importieren (Spec 01).` });
const internal = (pkg) => ({ group: [`@stb/${pkg}`, `@stb/${pkg}/*`], message: `Abhängigkeit auf @stb/${pkg} ist hier nicht erlaubt (Spec 01).` });
const runtimeBans = UI_AND_RUNTIME.map(pkgImport);
const APPS = ['web', 'server'];
const appBans = APPS.map((a) => ({ group: [`@stb/${a}`, `@stb/${a}/*`, `**/apps/${a}/**`], message: 'apps/* importieren nie einander (Spec 01).' }));
const PACKAGES = ['core', 'crypto', 'sync-protocol', 'analysis', 'export'];

/** Erlaubte interne Abhängigkeiten je Paket (Spec 01). */
const ALLOWED = {
  core: [],
  crypto: ['core'],
  'sync-protocol': ['core'],
  analysis: ['core'],
  export: ['core', 'analysis'],
};

const packageBlocks = PACKAGES.map((pkg) => ({
  files: [`packages/${pkg}/**/*.{ts,tsx,js,mjs}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        ...runtimeBans,
        ...appBans,
        ...PACKAGES.filter((p) => p !== pkg && !ALLOWED[pkg].includes(p)).map(internal),
      ],
    }],
  },
}));

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'reports/**', 'fixtures/**'] },
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
      'no-restricted-imports': ['error', { patterns: appBans.filter((_, i) => APPS[i] !== app) }],
    },
  })),
  {
    files: ['apps/web/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['dexie', 'dexie/*'], message: 'Komponenten greifen nur über data/repositories/* auf Daten zu (Spec 01).' },
          { group: ['**/data/db', '**/data/db.*', '**/data/db/**'], message: 'Komponenten greifen nur über data/repositories/* auf Daten zu (Spec 01).' },
          ...appBans.filter((_, i) => APPS[i] !== 'web'),
        ],
      }],
    },
  },
);
