// RDM-035: Passkey startet beim Öffnen der App (CRY-25) und Sortier-Modus der Vorlagen mit Mitscrollen (BLK-64).
import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

/** App in den Hintergrund und zurück (visibilityState wird dafür überschrieben). */
async function backgroundAndReturn(page: Page) {
  for (const state of ['hidden', 'visible']) {
    await page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  }
}

test.describe('Passkey beim Öffnen', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
  });

  test('CRY-25: Öffnen startet den Passkey ohne Tipp; scheitert er, bleibt der Knopf; Abbrechen leitet erst nach Hintergrund erneut um', async ({ page }) => {
    const { cdp, authenticatorId } = await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('cry25'));
    await go(page, '/history');

    // App neu öffnen: entsperrt ohne Tipp, zurück auf der vorherigen Ansicht
    await page.reload();
    await expect(page).toHaveURL(/\/history$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Verlauf', exact: true })).toBeVisible();
    await expect(page.getByTestId('lock-banner')).toHaveCount(0);

    // Passkey scheitert (kein Credential mehr): kein Fehlerhinweis, Knopf als Rückfall
    await cdp.send('WebAuthn.clearCredentials', { authenticatorId });
    await page.reload();
    await expect(page).toHaveURL(/\/unlock\?next=%2Fhistory&auto=1/);
    const button = page.getByRole('button', { name: 'Mit Passkey entsperren' });
    await expect(button).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Abbrechen: gesperrte Ansicht bleibt, keine erneute Umleitung …
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByTestId('lock-banner')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/history$/);
    // … erst nach Hintergrund → Vordergrund
    await backgroundAndReturn(page);
    await expect(page).toHaveURL(/\/unlock\?next=%2Fhistory&auto=1/);
  });
});

test.describe('Vorlagen sortieren', () => {
  test.describe.configure({ timeout: 120_000 });

  test('BLK-64: Sortier-Modus zeigt eine kompakte Liste; Ziehen über den sichtbaren Bereich hinaus scrollt mit und speichert die Reihenfolge', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/templates');
    const rows = page.getByTestId('template-row');
    for (let n = 2; n <= 12; n++) {
      await page.getByTestId('catalog-builtin').getByRole('button', { name: /Chronischer Schmerz/ }).click();
      await expect(rows).toHaveCount(n);
    }
    await page.setViewportSize({ width: 375, height: 560 });
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.getByRole('button', { name: 'Reihenfolge ändern' }).click();
    // kompakt: keine Aktionsknöpfe, keine weiteren Abschnitte
    await expect(page.getByRole('button', { name: /bearbeiten|archivieren|zum Vorlagenkatalog hinzufügen/ })).toHaveCount(0);
    await expect(page.getByTestId('template-catalog')).toHaveCount(0);
    const last = (await rows.last().boundingBox())!;
    expect(last.y + last.height).toBeGreaterThan(560);

    // Erste Vorlage an den unteren Rand ziehen und halten → Liste scrollt mit, Vorlage landet am Ende
    const grip = page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch verschieben' });
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, 560 - 100, { steps: 10 });
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2500);
    await page.mouse.move(g.x + g.width / 2, 560 - 95);
    await page.mouse.up();
    await expect(rows.last()).toContainText('Allgemeines Schmerz-Tagebuch');
    await expect(page.getByTestId('template-list')).toHaveAttribute('aria-busy', 'false');

    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByTestId('template-catalog')).toBeVisible();
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await go(page, '/more/templates');
    await expect(rows.last()).toContainText('Allgemeines Schmerz-Tagebuch', { timeout: 20_000 });
    await expect(rows.first()).toContainText('Chronischer Schmerz');
  });
});
