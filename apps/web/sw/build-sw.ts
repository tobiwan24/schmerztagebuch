// Vite-Plugin: erzeugt `sw.js` aus der Vorlage mit Version (aus src/version.ts) und Liste der gehashten Assets.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export function renderServiceWorker(template: string, version: string, assets: string[]): string {
  return template.replace("'__APP_VERSION__'", JSON.stringify(version)).replace('__ASSET_LIST__', JSON.stringify(assets));
}

export function serviceWorkerPlugin(version: string): Plugin {
  const templatePath = fileURLToPath(new URL('./sw.template.js', import.meta.url));
  return {
    name: 'stb-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
        .map((f) => `/${f}`)
        .sort();
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker(readFileSync(templatePath, 'utf8'), version, assets) });
    },
  };
}
