// nginx lässt die größten Server-Bodies durch (Standard 1 MB würde Anhänge mit 413 abweisen).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOB_CIPHERTEXT_MAX_CHARS, SHARE_CIPHERTEXT_MAX_CHARS } from '@stb/sync-protocol';

const nginx = readFileSync(join(import.meta.dirname, '../../apps/web/nginx.conf'), 'utf8');

function bytes(v: string): number {
  const m = /^(\d+)([kKmMgG]?)$/.exec(v);
  if (!m) throw new Error(`Unbekannte Größe: ${v}`);
  const unit = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2]!.toLowerCase() as '' | 'k' | 'm' | 'g'];
  return Number(m[1]) * unit;
}

describe('nginx Body-Grenze', () => {
  it('nginx-Body: client_max_body_size in /api/ deckt Anhänge (Blob) und Arzt-Link (Share) ab', () => {
    const block = /location \/api\/ \{([^}]*)\}/.exec(nginx)?.[1] ?? '';
    const v = /client_max_body_size\s+(\S+);/.exec(block)?.[1];
    expect(v, 'client_max_body_size fehlt in location /api/').toBeDefined();
    expect(bytes(v!)).toBeGreaterThanOrEqual(BLOB_CIPHERTEXT_MAX_CHARS + 1024);
    expect(bytes(v!)).toBeGreaterThanOrEqual(SHARE_CIPHERTEXT_MAX_CHARS + 4096);
  });
});
