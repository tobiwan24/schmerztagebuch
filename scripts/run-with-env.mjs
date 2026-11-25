#!/usr/bin/env node
// Plattformunabhängig Umgebungsvariablen setzen und einen Befehl ausführen (Windows-cmd kennt `VAR=1 cmd` nicht).
//   node scripts/run-with-env.mjs STB_DOCKER=1 -- npm run verify
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const sep = args.indexOf('--');
if (sep < 1 || sep === args.length - 1) {
  console.error('Aufruf: node scripts/run-with-env.mjs KEY=VALUE [KEY=VALUE …] -- <befehl> [args …]');
  process.exit(2);
}
const env = { ...process.env };
for (const pair of args.slice(0, sep)) {
  const eq = pair.indexOf('=');
  if (eq < 1) {
    console.error(`Ungültige Zuweisung: ${pair}`);
    process.exit(2);
  }
  env[pair.slice(0, eq)] = pair.slice(eq + 1);
}
const [cmd, ...rest] = args.slice(sep + 1);
const r = spawnSync(cmd, rest, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
