// VOI-16: Einstellungen → KI-Funktionen. Der echte Server läuft mit LLM_PROVIDER=off (404); der Status wird per
// page.route mit Fake-Antworten ersetzt. Echte Provider werden nie aufgerufen.
import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const OLLAMA = { provider: 'ollama', model: 'qwen2.5:7b-instruct', thirdParty: false, dailyTokens: 50_000, usedTokens: 1200 };
const ANTHROPIC = { provider: 'anthropic', model: 'claude-opus-5-5', thirdParty: true, dailyTokens: 50_000, usedTokens: 0 };

async function mockStatus(page: Page, status: object | null) {
  await page.route('**/api/v1/llm/status', (route) =>
    status ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }) : route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"llm_disabled"}' }),
  );
}

test.describe('Einstellungen → KI-Funktionen', () => {
  test.describe.configure({ timeout: 150_000 });

  test('VOI-16: ohne Konto (nur dieses Gerät) steht nur der Hinweis da, es gibt keinen Schalter und keine Statusanfrage', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => r.url().includes('/api/v1/llm') && calls.push(r.url()));
    await onboardWithPassword(page);
    await go(page, '/more/settings');
    await expect(page.getByTestId('llm-needs-account')).toBeVisible();
    await expect(page.getByLabel('KI-Funktionen verwenden')).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test('VOI-16: mit Konto zeigt die Karte Anbieter, Modell und Drittanbieter-Status; Opt-in ist aus und wird erst nach dem Hinweisdialog gesetzt', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockStatus(page, ANTHROPIC);
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('ki'));
    await go(page, '/more/settings');
    const card = page.getByTestId('llm-card');
    await expect(card.getByTestId('llm-status')).toContainText('Anthropic Claude');
    await expect(card.getByTestId('llm-status')).toContainText('claude-opus-5-5');
    await expect(card.getByTestId('llm-third-party')).toContainText('Ja');
    const optIn = card.getByLabel('KI-Funktionen verwenden');
    await expect(optIn).not.toBeChecked();

    await optIn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('llm-optin-recipient')).toContainText('Anthropic (Drittanbieter, USA)');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(optIn).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('stb-v3-llm'))).toBeNull();

    await optIn.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Einschalten' }).click();
    await expect(optIn).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('stb-v3-llm'))).toBe('1');
  });

  test('VOI-16: eigener Server (Ollama) wird als „keine Daten an Dritte“ angezeigt', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockStatus(page, OLLAMA);
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('ki'));
    await go(page, '/more/settings');
    await expect(page.getByTestId('llm-third-party')).toContainText('Nein');
    await expect(page.getByTestId('llm-card')).toContainText('1200 von 50000');

  });

  test('VOI-16: auf dem Server ausgeschaltet (404) erscheint nur der Hinweis, kein Schalter', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockStatus(page, null);
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('ki'));
    await go(page, '/more/settings');
    await expect(page.getByTestId('llm-off')).toBeVisible();
    await expect(page.getByLabel('KI-Funktionen verwenden')).toHaveCount(0);
  });
});
