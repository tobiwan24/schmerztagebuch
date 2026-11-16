// EXP-23: Arzt-Link erstellen und in einem frischen Browser-Kontext öffnen (Bericht, Diagramm, PDF-Download),
// Schlüssel nie in einer Anfrage, abgelaufen und falscher Schlüssel → verständliche Meldung.
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Request } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

const MARKER = 'STB-E2E-MARKER Arztlink';

async function addEntry(page: Page) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill('7');
  await page.getByLabel('Notizen').fill(MARKER);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

test.describe('Arzt-Link', () => {
  test.describe.configure({ timeout: 150_000 });

  test('EXP-23: Link erstellen, im frischen Kontext öffnen (Tabelle, Diagramm, PDF), falscher Schlüssel und abgelaufen melden verständlich', async ({ page, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    const requests: string[] = [];
    const record = (r: Request) => requests.push(`${r.url()} ${r.postData() ?? ''}`);
    page.on('request', record);

    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('arzt'));
    await addEntry(page);

    await go(page, '/more/export');
    await page.getByRole('button', { name: 'Arzt-Link erstellen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Jeder, der den Link hat/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Link erstellen' }).click();
    const link = await dialog.getByTestId('report-link').inputValue();
    const url = new URL(link);
    const id = url.pathname.replace('/r/', '');
    const key = url.hash.replace('#k=', '');
    expect(key).toHaveLength(43);
    // der Schlüssel erscheint in keiner Anfrage; der Chiffretext enthält den Klartext-Marker nicht
    expect(requests.filter((r) => r.includes(key))).toEqual([]);
    expect(requests.filter((r) => r.includes(MARKER))).toEqual([]);

    // Frischer Kontext: kein Konto, keine Daten
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
    const viewer = await ctx.newPage();
    const viewerRequests: Request[] = [];
    viewer.on('request', (r) => viewerRequests.push(r));
    await viewer.goto(link);
    await expect(viewer.getByTestId('report-viewer')).toBeVisible();
    await expect(viewer.getByTestId('report-table')).toContainText(MARKER);
    await expect(viewer.getByTestId('report-chart')).toBeVisible();
    await expect(viewer.getByText(/noch 4 Aufrufe/)).toBeVisible();
    // keine Anmeldung nötig, keine Datenbank angelegt, kein Referer, Schlüssel nie im Request
    expect(await viewer.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
    const api = viewerRequests.filter((r) => r.url().includes('/api/'));
    expect(api.map((r) => new URL(r.url()).pathname)).toEqual([`/api/v1/shares/${id}`]);
    expect(api[0]!.headers()['referer'] ?? '').toBe('');
    expect(viewerRequests.filter((r) => r.url().includes(key))).toEqual([]);
    const [d] = await Promise.all([viewer.waitForEvent('download', { timeout: 30_000 }), viewer.getByRole('button', { name: 'PDF herunterladen' }).click()]);
    const bytes = readFileSync((await d.path())!);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.subarray(bytes.length - 32).toString('latin1')).toContain('%%EOF');

    // falscher Schlüssel
    const wrong = await ctx.newPage();
    await wrong.goto(`/r/${id}#k=${'A'.repeat(43)}`);
    await expect(wrong.getByTestId('report-error')).toContainText('Schlüssel');
    // fehlender Schlüssel
    const none = await ctx.newPage();
    await none.goto(`/r/${id}`);
    await expect(none.getByTestId('report-error')).toContainText('fehlt der Schlüssel');
    // abgelaufen (Server antwortet 410) und unbekannt
    const expired = await ctx.newPage();
    await expired.route('**/api/v1/shares/*', (route) => route.fulfill({ status: 410, contentType: 'application/json', body: '{"error":"expired"}' }));
    await expired.goto(link);
    await expect(expired.getByTestId('report-error')).toContainText('abgelaufen');
    const unknown = await ctx.newPage();
    await unknown.goto(`/r/${'B'.repeat(22)}#k=${key}`);
    await expect(unknown.getByTestId('report-error')).toContainText('gibt es nicht');
    await ctx.close();
  });
});
