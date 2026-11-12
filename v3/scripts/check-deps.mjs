#!/usr/bin/env node
// QA-11: Jede Abhängigkeit in package.json-Dateien braucht einen Eintrag in DECISIONS.md („## Abhängigkeiten").
//   node scripts/check-deps.mjs [--root <dir>]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** Paketnamen aus der Tabelle unter „## Abhängigkeiten" (erste Spalte, Backticks entfernt). */
export function parseDecisionDeps(content) {
  const section = content.split(/^## Abhängigkeiten\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const names = new Set();
  for (const line of section.split(/\r?\n/)) {
    const m = /^\|\s*([^|]+?)\s*\|/.exec(line.trim());
    if (!m) continue;
    const name = m[1].replace(/`/g, '').trim();
    if (!name || name === 'Paket' || /^-+$/.test(name) || name.startsWith('_')) continue;
    names.add(name);
  }
  return names;
}

/** → Liste {pkg, name} aller externen Abhängigkeiten (interne Workspaces `@stb/*` ausgenommen). */
export function collectDeps(manifests) {
  const out = [];
  for (const { path, json } of manifests) {
    for (const field of DEP_FIELDS) {
      for (const name of Object.keys(json[field] ?? {})) {
        if (!name.startsWith('@stb/')) out.push({ pkg: path, name });
      }
    }
  }
  return out;
}

export function findUndocumented(manifests, decisionsContent) {
  const documented = parseDecisionDeps(decisionsContent);
  return collectDeps(manifests).filter((d) => !documented.has(d.name));
}

function readManifests(root) {
  const paths = ['package.json'];
  for (const dir of ['packages', 'apps']) {
    if (!existsSync(join(root, dir))) continue;
    for (const n of readdirSync(join(root, dir))) {
      if (existsSync(join(root, dir, n, 'package.json'))) paths.push(`${dir}/${n}/package.json`);
    }
  }
  return paths.map((path) => ({ path, json: JSON.parse(readFileSync(join(root, path), 'utf8')) }));
}

function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i]);
    else { console.error(`Unbekannte Option ${argv[i]}`); return 2; }
  }
  const missing = findUndocumented(readManifests(root), readFileSync(join(root, 'DECISIONS.md'), 'utf8'));
  if (missing.length) {
    console.error('Abhängigkeiten ohne Eintrag in DECISIONS.md:');
    for (const { pkg, name } of missing) console.error(`  ✗ ${name}  (${pkg})`);
    return 1;
  }
  console.log('✓ Alle Abhängigkeiten in DECISIONS.md dokumentiert');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
