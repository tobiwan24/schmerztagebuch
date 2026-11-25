// EXP-19: Die heruntergeladene PDF-Datei selbst wird mit pdfjs geöffnet (Seiten, Text) — nicht nur der Dateikopf.
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { go, onboardWithPassword } from './helpers';

const MARKER = 'STB-E2E-MARKER PdfDatei';

async function addEntry(page: Page) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill('6');
  const canvas = page.getByTestId('bodymap-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
  await page.getByLabel('Notizen').fill(MARKER);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

async function download(page: Page) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
  const path = await d.path();
  expect(path).toBeTruthy();
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

async function inspect(bytes: Uint8Array, password?: string) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), ...(password ? { password } : {}), isEvalSupported: false, verbosity: 0 }).promise;
  const texts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    texts.push((await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' '));
  }
  return { pages: doc.numPages, text: texts.join('\n') };
}

test.describe('PDF-Datei (heruntergeladen)', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const layout of ['Tabelle', 'Karten', 'Dashboard']) {
    for (const password of [undefined, 'geheim-123']) {
      test(`EXP-19: ${layout}${password ? ' mit Passwort' : ''} — Datei hat %PDF-/%%EOF und lässt sich mit pdfjs öffnen`, async ({ page }) => {
        await onboardWithPassword(page);
        await addEntry(page);
        await go(page, '/more/export');
        await page.getByRole('group', { name: 'PDF-Layout' }).getByRole('button', { name: layout }).click();
        if (password) await page.getByLabel('PDF-Passwort (optional)').fill(password);
        const { name, bytes } = await download(page);
        expect(name).toMatch(/\.pdf$/);
        expect(bytes.length).toBeGreaterThan(1000);
        expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
        expect(Buffer.from(bytes.subarray(bytes.length - 32)).toString('latin1')).toContain('%%EOF');
        if (password) await expect(inspect(bytes)).rejects.toThrow();
        const r = await inspect(bytes, password);
        expect(r.pages).toBeGreaterThanOrEqual(1);
        expect(r.text.length).toBeGreaterThan(20);
        if (layout !== 'Dashboard') expect(r.text).toContain('STB-E2E-MARKER');
      });
    }
  }
});
