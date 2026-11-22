#!/usr/bin/env node
// Schreibt das veröffentlichte JSON Schema des Exports (Spec 07) aus den zod-Schemas:
//   npx tsc -b packages/export && node scripts/gen-export-schema.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { exportJsonSchema } = await import(new URL('../packages/export/dist/index.js', import.meta.url).href);
const target = fileURLToPath(new URL('../packages/export/schema/stb-export-v1.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(exportJsonSchema(), null, 2)}\n`);
console.log(`geschrieben: ${target}`);
