// Geräteliste in den Einstellungen (CRY-19): „dieses Gerät“, anderes Gerät sperren, auf diesem Gerät abmelden.
import { test, expect } from '@playwright/test';
import { addDeviceWithBackupCode, addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

test.describe('Geräte', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
  });

  test('CRY-19: Geräteliste mit „dieses Gerät“, anderes Gerät sperren (Server 401), Abmelden verwirft den Zugang', async ({ page: a, browser }) => {
    await addVirtualAuthenticator(a);
    const user = uniqueUser('dev19');
    const code = await onboardWithCloud(a, user);
    const b = await addDeviceWithBackupCode(browser, user, code);

    await go(a, '/more/settings');
    await expect(a.getByTestId('device-row')).toHaveCount(2);
    const current = a.locator('[data-testid="device-row"][data-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('Dieses Gerät');
    expect((await b.request.get('/api/v1/diaries')).status()).toBe(200);

    // Anderes Gerät sperren: erst Rückfrage, danach „gesperrt“
    const other = a.locator('[data-testid="device-row"][data-current="false"]');
    await other.getByRole('button', { name: 'Sperren' }).click();
    await a.getByRole('button', { name: 'Gerät jetzt sperren' }).click();
    await expect(other).toContainText('gesperrt');
    await expect(other.getByRole('button', { name: 'Sperren' })).toHaveCount(0);
    expect((await b.request.get('/api/v1/diaries')).status()).toBe(401);

    // Abmelden auf diesem Gerät: Sitzung beendet, Zugang verworfen, Onboarding
    await a.getByRole('button', { name: 'Auf diesem Gerät abmelden' }).click();
    await a.getByRole('button', { name: 'Jetzt abmelden' }).click();
    await expect(a).toHaveURL(/\/onboarding$/);
    expect((await a.request.get('/api/v1/auth/me')).status()).toBe(401);
    const hasAccount = await a.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const open = indexedDB.open('stb-v3');
          open.onsuccess = () => {
            const get = open.result.transaction('keys').objectStore('keys').get('account');
            get.onsuccess = () => resolve(get.result !== undefined);
          };
        }),
    );
    expect(hasAccount).toBe(false);
    await b.context().close();
  });
});
