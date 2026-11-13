#!/usr/bin/env node
// Prüft Akzeptanz-IDs aus v3/spec/*.md gegen Testreports, MILESTONES.md und PROGRESS.md.
//
//   node scripts/check-acceptance.mjs                 # alle IDs (Gesamt-Definition-of-Done)
//   node scripts/check-acceptance.mjs --milestone M3  # nur IDs eines Meilensteins
//   node scripts/check-acceptance.mjs --structure     # Spec ↔ MILESTONES konsistent? (keine Reports nötig)
//   Optionen: --root <dir> (Standard: v3/), --json (maschinenlesbare Ausgabe)
//
// Keine Abhängigkeiten. Pure Funktionen werden exportiert (Selbsttest ARC-05).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ID_RE = /\b([A-Z]{2,4}-\d{2})\b/g;
const ROW_RE = /^\|\s*([A-Z]{2,4}-\d{2})\s*\|(.*)\|\s*(unit|integration|e2e|manual|dropped)\s*\|\s*$/;

/** Liest alle Akzeptanz-Zeilen aus Spec-Markdown. → Map<id, {level, text, file}> */
export function parseSpecs(files) {
  const specs = new Map();
  const errors = [];
  for (const { name, content } of files) {
    for (const line of content.split(/\r?\n/)) {
      const m = ROW_RE.exec(line.trim());
      if (!m) continue;
      const [, id, text, level] = m;
      if (specs.has(id)) errors.push(`Doppelte ID ${id} in ${name} und ${specs.get(id).file}`);
      else specs.set(id, { level, text: text.trim(), file: name });
    }
  }
  return { specs, errors };
}

/** MILESTONES.md: Tabellenzeilen `| M3 | Titel | IDs | Gate |`. → Map<milestone, Set<id>> */
export function parseMilestones(content) {
  const ms = new Map();
  for (const line of content.split(/\r?\n/)) {
    const m = /^\|\s*(M\d+[a-z]?)\s*\|([^|]*)\|([^|]*)\|/.exec(line.trim());
    if (!m) continue;
    ms.set(m[1], new Set([...m[3].matchAll(ID_RE)].map((x) => x[1])));
  }
  return ms;
}

/** PROGRESS.md: abgehakte manuelle IDs `- [x] UI-10 …`. → Set<id> */
export function parseManualChecks(content) {
  const done = new Set();
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*[-*]\s*\[[xX]\]\s*(.*)$/.exec(line);
    if (m) for (const x of m[1].matchAll(ID_RE)) done.add(x[1]);
  }
  return done;
}

/** Sammelt {title, status} aus Vitest-JSON (Jest-kompatibel) und Playwright-JSON. */
export function collectTests(vitest, playwright) {
  const out = [];
  for (const file of vitest?.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      out.push({ title: a.fullName || a.title || '', status: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped' });
    }
  }
  const walk = (suite, prefix) => {
    const p = [prefix, suite.title].filter(Boolean).join(' ');
    for (const spec of suite.specs ?? []) {
      const results = (spec.tests ?? []).flatMap((t) => t.results ?? []);
      let status = 'skipped';
      if (results.some((r) => r.status === 'failed' || r.status === 'timedOut' || r.status === 'interrupted')) status = 'failed';
      else if (results.length && results.every((r) => r.status === 'passed' || r.status === 'skipped') && results.some((r) => r.status === 'passed')) status = 'passed';
      if (spec.ok === false) status = 'failed';
      out.push({ title: `${p} ${spec.title}`.trim(), status });
    }
    for (const s of suite.suites ?? []) walk(s, p);
  };
  for (const s of playwright?.suites ?? []) walk(s, '');
  return out;
}

/** Bewertet IDs. Eine ID ist erfüllt, wenn ≥ 1 Test mit der ID bestanden hat und keiner fehlgeschlagen ist. */
export function evaluate({ specs, ids, tests, manualDone }) {
  const byId = new Map();
  for (const t of tests) {
    for (const x of t.title.matchAll(ID_RE)) {
      if (!byId.has(x[1])) byId.set(x[1], []);
      byId.get(x[1]).push(t);
    }
  }
  const result = { passed: [], failed: [], missing: [], manualOpen: [], manualDone: [], dropped: [], unknownInTests: [] };
  for (const id of ids) {
    const spec = specs.get(id);
    if (!spec) { result.missing.push({ id, reason: 'nicht in Specs definiert' }); continue; }
    if (spec.level === 'dropped') { result.dropped.push(id); continue; }
    if (spec.level === 'manual') { (manualDone.has(id) ? result.manualDone : result.manualOpen).push(id); continue; }
    const ts = byId.get(id) ?? [];
    if (ts.some((t) => t.status === 'failed')) result.failed.push(id);
    else if (ts.some((t) => t.status === 'passed')) result.passed.push(id);
    else result.missing.push({ id, reason: ts.length ? 'nur übersprungene Tests' : 'kein Test' });
  }
  for (const id of byId.keys()) if (!specs.has(id)) result.unknownInTests.push(id);
  return result;
}

/** Struktur: jede nicht-gestrichene ID in genau einem Meilenstein (manual-IDs dürfen fehlen), keine unbekannten IDs. */
export function checkStructure(specs, milestones, manualSection = new Set()) {
  const errors = [];
  const seen = new Map();
  for (const [m, ids] of milestones) {
    for (const id of ids) {
      if (!specs.has(id)) errors.push(`${m}: unbekannte ID ${id}`);
      if (seen.has(id)) errors.push(`${id} steht in ${seen.get(id)} und ${m}`);
      seen.set(id, m);
    }
  }
  for (const [id, s] of specs) {
    if (s.level === 'dropped') continue;
    if (s.level === 'manual') {
      if (!manualSection.has(id)) errors.push(`manuelle ID ${id} keinem Gate zugeordnet`);
      continue;
    }
    if (!seen.has(id)) errors.push(`${id} (${s.file}) ist keinem Meilenstein zugeordnet`);
  }
  return errors;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`Report ${path} ist kein gültiges JSON: ${e.message}`); }
}

function main(argv) {
  const args = { milestone: null, structure: false, json: false, root: resolve(dirname(fileURLToPath(import.meta.url)), '..') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--milestone') args.milestone = argv[++i];
    else if (a === '--structure') args.structure = true;
    else if (a === '--json') args.json = true;
    else if (a === '--root') args.root = resolve(argv[++i]);
    else { console.error(`Unbekannte Option ${a}`); return 2; }
  }
  const specDir = join(args.root, 'spec');
  const files = readdirSync(specDir).filter((f) => f.endsWith('.md')).sort()
    .map((name) => ({ name, content: readFileSync(join(specDir, name), 'utf8') }));
  const { specs, errors: specErrors } = parseSpecs(files);
  const msContent = existsSync(join(args.root, 'MILESTONES.md')) ? readFileSync(join(args.root, 'MILESTONES.md'), 'utf8') : '';
  const milestones = parseMilestones(msContent);
  const gateSection = msContent.split(/^## Manuelle Kriterien/m)[1] ?? '';
  const manualSection = new Set([...gateSection.matchAll(ID_RE)].map((x) => x[1]));
  const structErrors = [...specErrors, ...checkStructure(specs, milestones, manualSection)];

  if (args.structure) {
    if (args.json) console.log(JSON.stringify({ ok: !structErrors.length, errors: structErrors, ids: specs.size }));
    else if (structErrors.length) { console.error('Strukturfehler:'); for (const e of structErrors) console.error(`  ✗ ${e}`); }
    else console.log(`✓ Struktur ok: ${specs.size} IDs, ${milestones.size} Meilensteine`);
    return structErrors.length ? 1 : 0;
  }

  let ids;
  if (args.milestone) {
    const set = milestones.get(args.milestone);
    if (!set) { console.error(`Meilenstein ${args.milestone} nicht in MILESTONES.md`); return 2; }
    ids = [...set];
  } else ids = [...specs.keys()];

  const tests = collectTests(readJson(join(args.root, 'reports', 'vitest.json')), readJson(join(args.root, 'reports', 'playwright.json')));
  const progress = existsSync(join(args.root, 'PROGRESS.md')) ? readFileSync(join(args.root, 'PROGRESS.md'), 'utf8') : '';
  const r = evaluate({ specs, ids, tests, manualDone: parseManualChecks(progress) });
  const ok = !r.failed.length && !r.missing.length && (args.milestone ? true : !r.manualOpen.length) && !structErrors.length;

  if (args.json) { console.log(JSON.stringify({ ok, ...r, structureErrors: structErrors })); return ok ? 0 : 1; }
  const scope = args.milestone ?? 'gesamt';
  console.log(`Akzeptanz (${scope}): ${r.passed.length} erfüllt, ${r.failed.length} fehlgeschlagen, ${r.missing.length} fehlend, manuell ${r.manualDone.length}/${r.manualDone.length + r.manualOpen.length}`);
  for (const id of r.failed) console.log(`  ✗ ${id}  fehlgeschlagen — ${specs.get(id).text}`);
  for (const { id, reason } of r.missing) console.log(`  ○ ${id}  ${reason}${specs.get(id) ? ' — ' + specs.get(id).text : ''}`);
  if (!args.milestone) for (const id of r.manualOpen) console.log(`  ◇ ${id}  manuell offen (PROGRESS.md)`);
  for (const id of r.unknownInTests) console.log(`  ? ${id}  in Testnamen, aber nicht in Specs`);
  for (const e of structErrors) console.log(`  ✗ Struktur: ${e}`);
  console.log(ok ? '✓ OK' : '✗ NICHT ERFÜLLT');
  return ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
