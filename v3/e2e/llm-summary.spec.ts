// VOI-15: „Zusammenfassung für den Arzt“ im Export (Fake-Antworten per page.route, nie ein echter Provider).
// VOI-16: Das Panel ist ausgeblendet bei Opt-in aus oder ohne Konto und deaktiviert offline.
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const STATUS = { provider: 'anthropic', model: 'claude-opus-5-5', thirdParty: true, dailyTokens: 50_000, usedTokens: 0 };
const NOTE = 'STB-KI-NOTIZ-Klartext';

interface SummaryRequest { period: string; facts: { label: string; value: string }[]; notes?: string[] }

async function mockLlm(page: Page, summary: string) {
  const requests: SummaryRequest[] = [];
  await page.route('**/api/v1/llm/status', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }));
  await page.route('**/api/v1/llm/summary', (r: Route) => {
    requests.push(r.request().postDataJSON() as SummaryRequest);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary }) });
  });
  return requests;
}

async function addEntry(page: Page) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill('6');
  await page.getByLabel('Notizen').fill(NOTE);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

async function pdfText(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const texts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) texts.push((await (await doc.getPage(p)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' '));
  return texts.join('\n');
}

test.describe('Zusammenfassung für den Arzt', () => {
  test.describe.configure({ timeout: 150_000 });

  test('VOI-15: nur Kennzahlen gehen raus, Notizen nur per Häkchen, Text ist bearbeitbar mit Hinweis und landet im PDF', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    const requests = await mockLlm(page, 'Die Schmerzstärke lag im Mittel bei 6.');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('zus'));
    await page.evaluate(() => localStorage.setItem('stb-v3-llm', '1'));
    await addEntry(page);
    await go(page, '/more/export');

    // Standard: nur Kennzahlen; Abbrechen sendet nichts
    await page.getByTestId('llm-summary-open').click();
    const consent = page.getByRole('dialog');
    await expect(consent.getByTestId('llm-consent-recipient')).toHaveText('Anthropic (Drittanbieter, USA)');
    await expect(consent.getByTestId('llm-consent-text')).toContainText('Schmerzstärke');
    await expect(consent.getByTestId('llm-consent-text')).not.toContainText(NOTE);
    await consent.getByRole('button', { name: 'Abbrechen' }).click();
    expect(requests).toHaveLength(0);

    await page.getByTestId('llm-summary-open').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Senden' }).click();
    const text = page.getByLabel('Entwurf der Zusammenfassung (bearbeitbar)');
    await expect(text).toHaveValue('Die Schmerzstärke lag im Mittel bei 6.');
    await expect(page.getByTestId('llm-summary-notice')).toContainText('keine Diagnose');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.notes).toBeUndefined();
    expect(JSON.stringify(requests[0])).not.toContain(NOTE);

    // Mit Häkchen gehen die Notizen mit, und der Dialog zeigt sie vorher
    await page.getByLabel('Notizen mitsenden').check();
    await page.getByTestId('llm-summary-open').click();
    await expect(page.getByRole('dialog').getByTestId('llm-consent-text')).toContainText(NOTE);
    await page.getByRole('dialog').getByRole('button', { name: 'Senden' }).click();
    await expect(text).toHaveValue('Die Schmerzstärke lag im Mittel bei 6.');
    expect(requests).toHaveLength(2);
    expect(requests[1]!.notes?.some((n) => n.includes(NOTE))).toBe(true);

    // Bearbeiten und als PDF-Abschnitt exportieren
    await text.fill('Bearbeitet: im Mittel 6 von 10.');
    await expect(page.getByLabel('Als Abschnitt in den PDF-Export aufnehmen')).toBeChecked();
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    const pdf = await pdfText(new Uint8Array(readFileSync((await d.path())!)));
    expect(pdf).toContain('Zusammenfassung für den Arzt');
    expect(pdf).toContain('Bearbeitet: im Mittel 6 von 10.');
    expect(pdf).toContain('Keine Diagnose');

    // Abgewählt: kein Abschnitt
    await page.getByLabel('Als Abschnitt in den PDF-Export aufnehmen').uncheck();
    const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(await pdfText(new Uint8Array(readFileSync((await d2.path())!)))).not.toContain('Bearbeitet: im Mittel');
  });

  test('VOI-16: Zusammenfassung ist ohne Opt-in ausgeblendet und offline deaktiviert', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockLlm(page, 'x');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('zus2'));
    await go(page, '/more/export');
    await expect(page.getByRole('button', { name: 'Herunterladen', exact: true })).toBeVisible();
    await expect(page.getByTestId('llm-summary')).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem('stb-v3-llm', '1'));
    await go(page, '/more');
    await go(page, '/more/export');
    await expect(page.getByTestId('llm-summary-open')).toBeEnabled();
    await page.context().setOffline(true);
    await expect(page.getByTestId('llm-summary-open')).toBeDisabled();
    await page.context().setOffline(false);
    await expect(page.getByTestId('llm-summary-open')).toBeEnabled();
  });

  test('VOI-16: ohne Konto gibt es keine Zusammenfassung, auch bei gesetztem Opt-in', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('stb-v3-llm', '1'));
    await onboardWithPassword(page);
    await go(page, '/more/export');
    await expect(page.getByRole('button', { name: 'Herunterladen', exact: true })).toBeVisible();
    await expect(page.getByTestId('llm-summary')).toHaveCount(0);
  });
});
