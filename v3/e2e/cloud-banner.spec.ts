import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

async function addEntry(page: import('@playwright/test').Page) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill('4');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

test.describe('Start-Banner „Mit Konto synchronisieren"', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-23: local-only erst mit Eintrag, führt zu den Einstellungen, wegklickbar und danach verborgen', async ({ page }) => {
    await onboardWithPassword(page);
    await expect(page.getByTestId('cloud-banner')).toHaveCount(0);
    await addEntry(page);
    await go(page, '/');
    const banner = page.getByTestId('cloud-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('link', { name: 'Zu den Einstellungen' }).click();
    await expect(page).toHaveURL(/\/more\/settings$/);
    await expect(page.getByRole('button', { name: 'Mit Konto synchronisieren' })).toBeVisible();
    await go(page, '/');
    await banner.getByRole('button', { name: 'Ausblenden' }).click();
    await expect(banner).toHaveCount(0);
    await go(page, '/history');
    await go(page, '/');
    await expect(banner).toHaveCount(0);
  });

  test('UI-23: im Konto-Modus nie', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('cb'));
    await addEntry(page);
    await go(page, '/');
    await expect(page.getByTestId('cloud-banner')).toHaveCount(0);
  });
});
