import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderServiceWorker } from './build-sw';
import { APP_VERSION } from '../src/version';

const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');

describe('Service-Worker-Build', () => {
  it('SYN-15: setzt Version aus version.ts und Asset-Liste ein; /api/ wird nie gecacht', () => {
    const sw = renderServiceWorker(template, APP_VERSION, ['/assets/a-1.js']);
    expect(sw).toContain(`const VERSION = ${JSON.stringify(APP_VERSION)};`);
    expect(sw).toContain('const ASSETS = ["/assets/a-1.js"];');
    expect(sw).not.toMatch(/__APP_VERSION__|__ASSET_LIST__/);
    expect(sw).toMatch(/startsWith\('\/api\/'\)\) return;/);
  });
});
