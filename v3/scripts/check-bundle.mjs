#!/usr/bin/env node
// Build-Analyse (Spec 12): initiales JS der Web-App ≤ 250 KB gzip (QA-02) — Einstiegs-Modul plus alles, was
// `index.html` sofort lädt (`<script src>`, `<link rel="modulepreload">`) und dessen statische Importe. Zusätzlich
// meldet der Service Worker dieselbe Version wie `version.ts` (QA-10). Exit-Code 1 bei Verstoß.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const INITIAL_JS_BUDGET = 250 * 1024;

/** Statische Importe einer Vite-Ausgabedatei (`import … from "./x.js"`), ohne dynamische `import()`. */
function staticImports(code) {
  const out = new Set();
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s*(?:[\w*{}\s,$]+from\s*)?["']\.\/([\w.-]+\.js)["']/g)) out.add(m[1]);
  return [...out];
}

export function analyze(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const roots = [...html.matchAll(/(?:src|href)="\/assets\/([\w.-]+\.js)"/g)].map((m) => m[1]);
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const code = readFileSync(join(distDir, 'assets', f), 'utf8');
    queue.push(...staticImports(code));
  }
  const files = [...seen].map((f) => ({ file: f, gzip: gzipSync(readFileSync(join(distDir, 'assets', f))).length }));
  return { files, total: files.reduce((s, f) => s + f.gzip, 0) };
}

export function versions(distDir, versionFile) {
  const app = /APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(versionFile, 'utf8'))?.[1];
  const sw = /const VERSION = "([^"]+)"/.exec(readFileSync(join(distDir, 'sw.js'), 'utf8'))?.[1];
  return { app, sw };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = join(root, 'apps/web/dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('check-bundle: apps/web/dist fehlt — erst bauen');
    process.exit(1);
  }
  const { files, total } = analyze(dist);
  const v = versions(dist, join(root, 'apps/web/src/version.ts'));
  console.log(`Initiales JS: ${(total / 1024).toFixed(1)} KB gzip (Budget ${INITIAL_JS_BUDGET / 1024} KB) in ${files.length} Datei(en); Version App ${v.app}, SW ${v.sw}`);
  if (total > INITIAL_JS_BUDGET || !v.app || v.app !== v.sw) process.exit(1);
}
