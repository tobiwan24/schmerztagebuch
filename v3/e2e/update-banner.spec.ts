import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const showUpdate = (page: import('@playwright/test').Page) => page.evaluate(() => window.dispatchEvent(new Event('stb:test-update-available')));

test.describe('Update-Hinweis', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-17: local-only bietet „Vorher Backup erstellen" an und führt zum Backup', async ({ page }) => {
    await onboardWithPassword(page);
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
    await showUpdate(page);
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Vorher Backup erstellen' })).toHaveCount(0);
  });
});
