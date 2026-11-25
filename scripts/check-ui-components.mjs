#!/usr/bin/env node
// UI-33 (Spec 10, A-147): „nur shadcn“. Jede Datei in components/ui/ und jedes Paket der Web-App steht im Register
// spec/ui-components.json; Ausnahmen brauchen eine User-Freigabe in DECISIONS.md. Lint-Umgehung per eslint-disable ist verboten.
//   node scripts/check-ui-components.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTER_PATH = join(root, 'spec', 'ui-components.json');

/** Register laden (auch von eslint.config.js genutzt). */
export function loadRegister(path = REGISTER_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Ist die A-ID in DECISIONS.md als Freigabe des Users dokumentiert? */
export function hasUserApproval(decisions, id) {
  if (!/^A-\d{3}$/.test(id ?? '')) return false;
  const row = decisions.split(/\r?\n/).find((l) => l.startsWith(`| ${id} |`));
  return !!row && /Freigabe User \d{4}-\d{2}-\d{2}/.test(row);
}

const DISABLE = /eslint-disable(?:-next-line|-line)?(?![\w-])(?:[ \t]+([^\n*]*))?/g;

/**
 * Prüft Register gegen den Bestand. → Liste von Fehlertexten (leer = ok).
 * @param {{ register: any, uiFiles: string[], deps: string[], decisions: string, sources: { path: string, text: string }[] }} input
 */
export function checkUiRegister({ register, uiFiles, deps, decisions, sources }) {
  const errors = [];
  const comps = register.components ?? {};
  const approved = (what, entry) => {
    if (!entry.approval) errors.push(`${what}: Ausnahme ohne Freigabe (approval fehlt)`);
    else if (!hasUserApproval(decisions, entry.approval)) errors.push(`${what}: ${entry.approval} ist in DECISIONS.md nicht als „Freigabe User JJJJ-MM-TT“ dokumentiert`);
  };

  for (const name of uiFiles) {
    const entry = comps[name];
    if (!entry) errors.push(`components/ui/${name}.tsx steht nicht im Register (shadcn-Original eintragen oder Ausnahme mit User-Freigabe)`);
    else if (entry.source === 'shadcn') {
      if (!/^https:\/\/ui\.shadcn\.com\//.test(entry.doc ?? '')) errors.push(`components/ui/${name}.tsx: shadcn-Eintrag ohne Doku-Link auf ui.shadcn.com`);
    } else if (entry.source === 'ausnahme') approved(`components/ui/${name}.tsx`, entry);
    else errors.push(`components/ui/${name}.tsx: unbekannte Quelle „${entry.source}“`);
  }
  for (const name of Object.keys(comps)) if (!uiFiles.includes(name)) errors.push(`Register-Eintrag „${name}“ ohne Datei in components/ui/`);

  // Alle Element-Gruppen außer „neutral“ brauchen eine Freigabe (structural, temporary, media …).
  for (const [key, group] of Object.entries(register.elements ?? {})) {
    if (key === 'neutral' || key.startsWith('$')) continue;
    if (group?.list?.length) approved(`Elemente (${key})`, group);
  }

  const depReg = register.dependencies ?? {};
  for (const dep of deps) {
    if (dep.startsWith('@stb/')) continue;
    const entry = depReg[dep];
    if (!entry) errors.push(`Paket „${dep}“ steht nicht im Register (ui-only, frei oder Ausnahme mit User-Freigabe)`);
    else if (entry.kind === 'ausnahme') approved(`Paket „${dep}“`, entry);
    else if (!['ui-only', 'frei'].includes(entry.kind)) errors.push(`Paket „${dep}“: unbekannte Art „${entry.kind}“`);
  }

  for (const { path, text } of sources) {
    for (const m of text.matchAll(DISABLE)) {
      const rules = (m[1] ?? '').trim();
      if (!rules || /no-restricted-(syntax|imports)/.test(rules)) errors.push(`${path}: eslint-disable umgeht die UI-Regeln — Ausnahmen nur über das Register`);
    }
  }
  return errors;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** Ist-Zustand der Web-App einlesen. */
export function collect(webDir = join(root, 'apps', 'web')) {
  const src = join(webDir, 'src');
  const uiDir = join(src, 'components', 'ui');
  const uiFiles = existsSync(uiDir) ? readdirSync(uiDir).filter((f) => extname(f) === '.tsx').map((f) => basename(f, '.tsx')).sort() : [];
  const deps = Object.keys(JSON.parse(readFileSync(join(webDir, 'package.json'), 'utf8')).dependencies ?? {});
  const sources = walk(src).map((p) => ({ path: relative(root, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }));
  return { uiFiles, deps, sources };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = checkUiRegister({ register: loadRegister(), decisions: readFileSync(join(root, 'DECISIONS.md'), 'utf8'), ...collect() });
  if (errors.length) {
    console.error('UI-33: nur shadcn/ui — Register spec/ui-components.json (Ausnahmen nur mit User-Freigabe, A-147):');
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
}
