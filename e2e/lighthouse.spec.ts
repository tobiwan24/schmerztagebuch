// QA-03: Lighthouse ≥ 90 in Best Practices und Accessibility; „PWA“ als Installierbarkeits-Prüfung (Lighthouse 12+ hat keine
// PWA-Kategorie mehr, DECISIONS A-036). Gemessen gegen die Vorschau (Produktions-Build mit CSP aus QA-04).
import { test, expect, chromium, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { navigation, snapshot } from 'lighthouse';
import { go, onboardWithPassword, swReady } from './helpers';

const DEBUG_PORT = 9333;
const CATEGORIES = ['accessibility', 'best-practices'] as const;
const THRESHOLD = 0.9;
const REPORT = fileURLToPath(new URL('../reports/lighthouse.json', import.meta.url));

type Scores = Record<string, Record<string, number | null>>;

interface Lhr {
  categories: Record<string, { score: number | null; auditRefs: { id: string; weight: number }[] }>;
  audits: Record<string, { score: number | null; title: string; scoreDisplayMode: string; details?: { items?: { node?: { selector?: string } }[] } }>;
}

function failing(lhr: Lhr, category: string): string[] {
  return lhr.categories[category].auditRefs
    .filter((r) => r.weight > 0 && lhr.audits[r.id].score !== null && (lhr.audits[r.id].score ?? 1) < 1)
    .map((r) => {
      const a = lhr.audits[r.id];
      const nodes = (a.details?.items ?? []).slice(0, 3).map((i) => i.node?.selector).filter(Boolean).join(' | ');
      return `${r.id}: ${a.title}${nodes ? ` [${nodes}]` : ''}`;
    });
}

async function waitForDebugPort(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chromium-Debug-Port nicht erreichbar');
}

test.describe('Lighthouse und Installierbarkeit', () => {
  test.describe.configure({ timeout: 240_000, mode: 'serial' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'Lighthouse läuft nur mit Chromium');

  let proc: ChildProcess;
  let profile: string;
  let page: Page;
  let pptrBrowser: Awaited<ReturnType<typeof puppeteer.connect>>;
  const scores: Scores = {};

  test.beforeAll(async () => {
    profile = mkdtempSync(join(tmpdir(), 'stb-lh-'));
    proc = spawn(
      chromium.executablePath(),
      [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--lang=de-DE', 'about:blank'],
      { stdio: 'ignore' },
    );
    await waitForDebugPort();
    const pw = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const ctx = pw.contexts()[0] ?? (await pw.newContext());
    page = await ctx.newPage();
    await page.setViewportSize({ width: 375, height: 812 });
    // Per CDP verbunden → kein baseURL aus der Konfiguration; die Hilfsfunktionen navigieren relativ.
    const goto = page.goto.bind(page);
    page.goto = ((url: string, options?: Parameters<Page['goto']>[1]) => goto(url.startsWith('/') ? `http://localhost:4173${url}` : url, options)) as Page['goto'];
    pptrBrowser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
  });

  test.afterAll(async () => {
    mkdirSync(join(REPORT, '..'), { recursive: true });
    writeFileSync(REPORT, JSON.stringify(scores, null, 2));
    console.log(`Lighthouse-Werte: ${JSON.stringify(scores)}`);
    await pptrBrowser?.disconnect();
    proc?.kill();
    await new Promise((r) => setTimeout(r, 500));
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Windows hält Dateien kurz fest */
    }
  });

  async function pptrPageFor(url: string) {
    const pages = await pptrBrowser.pages();
    const p = pages.find((x) => x.url() === url);
    if (!p) throw new Error(`Seite ${url} nicht gefunden: ${pages.map((x) => x.url()).join(', ')}`);
    return p;
  }

  function check(route: string, lhr: Lhr) {
    scores[route] = {};
    for (const c of CATEGORIES) scores[route][c] = lhr.categories[c].score;
    for (const c of CATEGORIES) {
      const f = failing(lhr, c);
      if (f.length) console.log(`Lighthouse ${route} ${c} nicht voll: ${f.join('; ')}`);
      expect(lhr.categories[c].score, `${route} ${c}: ${failing(lhr, c).join('; ')}`).toBeGreaterThanOrEqual(THRESHOLD);
    }
  }

  test('QA-03: Lighthouse Start/Onboarding (Navigation, frisch) ≥ 90 in Best Practices und Accessibility', async ({ baseURL }) => {
    const pptr = await pptrBrowser.newPage();
    const result = await navigation(pptr, `${baseURL}/`, {
      config: {
        extends: 'lighthouse:default',
        settings: { onlyCategories: [...CATEGORIES], formFactor: 'mobile', throttlingMethod: 'provided', locale: 'de' },
      },
    });
    expect(result).toBeTruthy();
    expect(result!.lhr.finalDisplayedUrl).toContain('/onboarding');
    await pptr.close();
    check('/onboarding (Navigation)', result!.lhr as unknown as Lhr);
  });

  test('QA-03: Lighthouse Hauptansichten (Start, Verlauf, Auswertung, Neuer Eintrag, Mehr) ≥ 90 in Best Practices und Accessibility', async () => {
    await onboardWithPassword(page);
    for (const route of ['/', '/history', '/analysis', '/entry/new', '/more']) {
      await go(page, route);
      await page.waitForTimeout(500);
      const pptr = await pptrPageFor(page.url());
      const result = await snapshot(pptr, {
        config: { extends: 'lighthouse:default', settings: { onlyCategories: [...CATEGORIES], formFactor: 'mobile', locale: 'de' } },
      });
      expect(result).toBeTruthy();
      check(`${route} (Snapshot)`, result!.lhr as unknown as Lhr);
    }
  });

  test('QA-03: Installierbarkeit (PWA): gültiges Manifest, Symbole 192/512/maskable, Service Worker kontrolliert die Seite, Start offline', async ({ baseURL }) => {
    await page.goto(`${baseURL}/`);
    // Manifest verlinkt und gültig
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await page.request.get(new URL(href!, baseURL).toString());
    expect(res.ok()).toBe(true);
    const m = (await res.json()) as {
      name: string; short_name: string; start_url: string; display: string; icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
    expect(new URL(m.start_url, baseURL).origin).toBe(new URL(baseURL!).origin);
    const sized = (s: string, purpose: string) =>
      m.icons.find((i) => i.sizes === s && i.type === 'image/png' && (i.purpose ?? 'any').split(' ').includes(purpose));
    expect(sized('192x192', 'any')).toBeTruthy();
    expect(sized('512x512', 'any')).toBeTruthy();
    expect(sized('512x512', 'maskable')).toBeTruthy();
    // Symbole sind erreichbar und echte PNGs der angegebenen Größe
    for (const icon of m.icons) {
      const r = await page.request.get(new URL(icon.src, baseURL).toString());
      expect(r.ok()).toBe(true);
      const buf = await r.body();
      expect(buf.subarray(1, 4).toString()).toBe('PNG');
      expect(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    // Sicherer Kontext + Service Worker kontrolliert die Seite
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
    await swReady(page);
    // Offline: start_url lädt aus der App-Shell
    await page.context().setOffline(true);
    try {
      await page.goto(new URL(m.start_url, baseURL).toString());
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });
      await expect(page.locator('html')).toHaveAttribute('data-route', /.+/);
    } finally {
      await page.context().setOffline(false);
    }
  });
});
