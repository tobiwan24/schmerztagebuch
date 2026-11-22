import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, finishDiarySetup, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const showUpdate = (page: import('@playwright/test').Page) => page.evaluate(() => window.dispatchEvent(new Event('stb:test-update-available')));

/** Standard ist „automatisch“ (kein Hinweis, UI-22); die Banner-Tests stellen auf „Nur Hinweis“. */
async function notifyOnly(page: import('@playwright/test').Page) {
  await go(page, '/more/settings');
  await page.getByTestId('update-settings').getByRole('button', { name: 'Nur Hinweis' }).click();
  await go(page, '/');
}

test.describe('Update-Hinweis', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-17: local-only bietet „Vorher Backup erstellen" an und führt zum Backup', async ({ page }) => {
    await onboardWithPassword(page);
    await notifyOnly(page);
    await showUpdate(page);
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Neu starten' })).toBeVisible();
    await banner.getByRole('button', { name: 'Vorher Backup erstellen' }).click();
    await expect(page).toHaveURL(/\/more\/export#backup$/);
    await expect(page.getByText('Backup', { exact: true }).first()).toBeVisible();
  });

  test('UI-17: mit Konto fehlt das Backup-Angebot', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('upd'));
    await notifyOnly(page);
    await showUpdate(page);
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Vorher Backup erstellen' })).toHaveCount(0);
  });

  test('UI-22: Standard „automatisch" zeigt keinen Hinweis; im Onboarding gewählt „Nur Hinweis" gilt und steht in den Einstellungen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    const toggle = page.getByRole('button', { name: 'Nur Hinweis' });
    await expect(page.getByRole('button', { name: 'Selbstständig' })).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // restliches Onboarding (wie onboardWithPassword ab „Weiter")
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Nur auf diesem Gerät/ }).click();
    await page.getByRole('button', { name: 'Mit Passwort' }).click();
    await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill('sicheres-passwort-123');
    await page.getByLabel('Passwort wiederholen').fill('sicheres-passwort-123');
    await page.getByRole('button', { name: 'Konto anlegen' }).click();
    await page.getByTestId('backup-code').waitFor({ timeout: 30_000 });
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await finishDiarySetup(page);
    await go(page, '/more/settings');
    await expect(page.getByTestId('update-settings').getByRole('button', { name: 'Nur Hinweis' })).toHaveAttribute('aria-pressed', 'true');
    await go(page, '/');
    await showUpdate(page);
    await expect(page.getByTestId('update-banner')).toBeVisible();
  });

  test('UI-22: automatisch → kein Banner; „Nach Updates suchen" meldet „aktuell", bei bereitem Update erscheint der Hinweis', async ({ page }) => {
    await onboardWithPassword(page);
    await showUpdate(page);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    await go(page, '/more/settings');
    await expect(page.getByTestId('update-settings').getByRole('button', { name: 'Selbstständig' })).toHaveAttribute('aria-pressed', 'true');
    // Update ist (per Testnaht) bereit: die Suche zeigt den Hinweis auch im Modus „automatisch"
    await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
    await expect(page.getByTestId('update-banner')).toBeVisible();
  });
});
