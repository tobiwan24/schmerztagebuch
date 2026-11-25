// ARC-07: Bundle-Scan — der Web-Build enthält weder das Anthropic-SDK noch Provider-Namen.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanForbidden } from './check-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fakeDist(files) {
  const dist = mkdtempSync(join(tmpdir(), 'stb-dist-'));
  mkdirSync(join(dist, 'assets'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dist, 'assets', name), text);
  return dist;
}

describe('Bundle-Scan', () => {
  it('ARC-07: findet SDK-Namen und Provider-Variablen in dist/assets', () => {
    const dist = fakeDist({ 'a.js': 'import x from "@anthropic-ai/sdk"', 'b.js': 'process.env.OLLAMA_URL', 'c.js': 'ANTHROPIC_API_KEY', 'd.js': 'ok', 'e.png': 'ANTHROPIC' });
    expect(scanForbidden(dist).map((h) => `${h.file}:${h.term}`).sort()).toEqual(['a.js:@anthropic-ai/sdk', 'b.js:OLLAMA', 'c.js:ANTHROPIC']);
  });

  it('ARC-07: ein sauberer Build und ein fehlender Ordner bleiben ohne Treffer', () => {
    expect(scanForbidden(fakeDist({ 'a.js': 'console.log(1)' }))).toEqual([]);
    expect(scanForbidden(join(tmpdir(), 'stb-gibt-es-nicht'))).toEqual([]);
  });

  it('ARC-07: der gebaute Web-Build (falls vorhanden) ist frei von SDK und Provider-Namen', () => {
    const dist = join(root, 'apps/web/dist');
    if (!existsSync(join(dist, 'index.html'))) return;
    expect(scanForbidden(dist)).toEqual([]);
  });
});
