// EXP-27: Einstellungen → Integrationen — anlegen (Zugangsstring nur einmal), Liste, widerrufen; der Zugang liest nur.
import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

test.describe('Integrationen', () => {
  test.describe.configure({ timeout: 90_000 });

  test('EXP-27: anlegen mit einmaliger Anzeige des Zugangsstrings, Liste, Widerruf; der Token liest nur', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('integ'));
    await go(page, '/more/settings');

    const card = page.getByTestId('integrations-card');
    await expect(card).toContainText('Schlüsselrotation');
    await expect(card).toContainText('widerruft alle Integrationen');
    await expect(card.getByText('Noch keine Integration eingerichtet.')).toBeVisible();

    await card.getByLabel('Name der Integration').fill('Claude Desktop');
    await card.getByRole('button', { name: 'Integration anlegen' }).click();
    const dialog = page.getByRole('dialog');
    const secret = await dialog.getByTestId('integration-secret').inputValue();
    expect(secret).toMatch(/^stbi1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{8}$/);
    await expect(dialog).toContainText('nicht mehr angezeigt');
    await dialog.getByRole('button', { name: 'Fertig, geschlossen' }).click();

    // Nach dem Schließen taucht der Zugangsstring nirgends mehr auf
    await expect(page.getByTestId('integration-secret')).toHaveCount(0);
    const row = page.getByTestId('integration-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Claude Desktop');
    await expect(row).toContainText('aktiv');
    await expect(row).toContainText('noch nie genutzt');
    expect(await page.content()).not.toContain(secret);

    // Der Token (Teil des Zugangsstrings) liest, schreibt aber nie
    const payload = JSON.parse(Buffer.from(secret.split('.')[1]!, 'base64url').toString('utf8')) as { t: string };
    const auth = { authorization: `Bearer ${payload.t}` };
    const read = await page.request.get('/api/v1/integration/records', { headers: auth });
    expect(read.status()).toBe(200);
    expect((await page.request.post('/api/v1/sync/push', { headers: auth, data: {} })).status()).toBe(403);
    await go(page, '/more/settings');
    await expect(page.getByTestId('integration-row')).toContainText(/zuletzt genutzt am/);

    // Widerruf mit Rückfrage; danach kein Zugriff mehr
    await page.getByTestId('integration-row').getByRole('button', { name: 'Widerrufen' }).click();
    await page.getByRole('button', { name: 'Jetzt widerrufen' }).click();
    await expect(page.getByTestId('integration-row')).toContainText('widerrufen');
    await expect(page.getByTestId('integration-row').getByRole('button', { name: 'Widerrufen' })).toHaveCount(0);
    expect((await page.request.get('/api/v1/integration/records', { headers: auth })).status()).toBe(401);
  });
});
