import { test, expect, type Page } from '@playwright/test';
import { APP_VERSION } from '../apps/web/src/version';
import { go, lockViaSettings, onboardWithPassword, PASSWORD } from './helpers';

// Die Konfiguration setzt `stb-v3-whatsnew` für alle Tests (Dialog aus); diese Datei prüft den Dialog selbst.
test.use({ storageState: { cookies: [], origins: [] } });

const KEY = 'stb-v3-whatsnew';
const lastSeen = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

async function unlockInSettings(page: Page) {
  await page.getByRole('main').getByRole('link', { name: 'Entsperren' }).click();
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
  await expect(page).toHaveURL(/\/more\/settings\/sicherheit$/, { timeout: 30_000 });
  await expect(page.getByTestId('lock-banner')).toHaveCount(0);
}

test.describe('Neuigkeiten', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-27: Neuinstallation zeigt keinen Dialog und setzt die gesehene Version', async ({ page }) => {
    await onboardWithPassword(page);
    expect(await lastSeen(page)).toBe(APP_VERSION);
    await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  });

  test('UI-27: nach einem Update erscheint einmal „Neu in Version x“; Schließen merkt die Version, auch nach Reload', async ({ page }) => {
    await onboardWithPassword(page);
    await page.evaluate((k) => localStorage.setItem(k, '0.9.0'), KEY);
    await lockViaSettings(page);
    await unlockInSettings(page);

    const dialog = page.getByTestId('whats-new-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: `Neu in Version ${APP_VERSION}` })).toBeVisible();
    await expect(dialog.getByTestId('release').first()).toContainText(APP_VERSION);
    await dialog.getByRole('button', { name: 'Verstanden' }).click();
    await expect(dialog).toBeHidden();
    expect(await lastSeen(page)).toBe(APP_VERSION);

    await page.reload();
    await expect(page.getByTestId('lock-banner')).toBeVisible();
    await unlockInSettings(page);
    await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  });

  test('UI-27: Einstellungen → Über listet alle Neuigkeiten', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/settings/diagnose');
    const list = page.getByTestId('whats-new-list');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('release').filter({ hasText: APP_VERSION })).toHaveCount(1);
  });
});
