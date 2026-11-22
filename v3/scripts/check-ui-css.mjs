#!/usr/bin/env node
// UI-01: Außer `index.css` (Tailwind + shadcn-Tokens) gibt es in apps/web/src kein eigenes CSS (Spec 10).
//   node scripts/check-ui-css.mjs
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STYLE_EXT = /\.(css|scss|sass|less|styl)$/i;

/** → relative Pfade aller verbotenen Stylesheets unterhalb von `srcDir`. */
export function findForbiddenCss(srcDir) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (STYLE_EXT.test(name)) {
        const rel = relative(srcDir, p).replace(/\\/g, '/');
        if (rel !== 'index.css') out.push(rel);
      }
    }
  };
  if (existsSync(srcDir)) walk(srcDir);
  return out.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');
  const bad = findForbiddenCss(src);
  if (bad.length) {
    console.error('Eigenes CSS ist nicht erlaubt (Spec 10, UI-01) — nur src/index.css:');
    for (const f of bad) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}
