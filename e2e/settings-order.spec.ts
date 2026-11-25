import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, lockViaSettings, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

test.describe.configure({ timeout: 120_000 });

const MENU = [
  ['Konto & Sync', '/more/settings/konto'],
  ['Updates', '/more/settings/updates'],
  ['Sicherheit & Sperre', '/more/settings/sicherheit'],
  ['Darstellung', '/more/settings/darstellung'],
  ['Erinnerungen & Hinweise', '/more/settings/erinnerungen'],
  ['KI-Funktionen', '/more/settings/ki'],
  ['Speicher & Daten', '/more/settings/daten'],
  ['Über & Diagnose', '/more/settings/diagnose'],
] as const;

function card(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }) });
}

test.describe('Einstellungen als Menü', () => {
  test('RDM-029: Einstellungen als Menü wie „Mehr“ — Reihenfolge, Unterseiten, Zurück, 375 px', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/settings');
    const links = page.getByTestId('settings-menu').getByRole('link');
    await expect(links).toHaveText(MENU.map(([label]) => label));
    for (const link of await links.all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const [label, path] of MENU) {
      await page.getByTestId('settings-menu').getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Zurück' }).click();
      await expect(page.getByTestId('settings-menu')).toBeVisible();
    }
  });

  test('RDM-028 P7 / RDM-029: Backup-Code am Ende von Konto & Sync, Sicherheit nur „Jetzt sperren“ (Konto)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('order'));
    await go(page, '/more/settings/konto');
    const account = page.getByTestId('account-card');
    const renew = account.getByRole('button', { name: 'Backup-Code erneuern' });
    await expect(renew).toBeVisible();
    const sync = await account.getByRole('button', { name: 'Jetzt synchronisieren' }).boundingBox();
    expect((await renew.boundingBox())!.y).toBeGreaterThan(sync!.y);
    await go(page, '/more/settings/sicherheit');
    const security = card(page, 'Sicherheit');
    await expect(security.getByRole('button')).toHaveCount(1);
    await expect(security.getByRole('button', { name: 'Jetzt sperren' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Backup-Code erneuern' })).toHaveCount(0);
  });

  test('RDM-028 P7 / RDM-029: Backup-Code in Konto & Sync (nur dieses Gerät); gesperrt sind die Unterseiten erreichbar', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/settings/konto');
    const account = card(page, 'Konto & Sync');
    await expect(account.getByRole('button', { name: 'Backup-Code erneuern' })).toBeVisible();
    await expect(account.getByTestId('factors')).toBeVisible();
    await go(page, '/more/settings/sicherheit');
    const security = card(page, 'Sicherheit');
    await expect(security.getByRole('button')).toHaveCount(1);
    await expect(security.getByRole('button', { name: 'Jetzt sperren' })).toBeVisible();

    await lockViaSettings(page);
    for (const [, path] of MENU) {
      await go(page, path);
      await expect(page.getByTestId('locked-view')).toHaveCount(0);
    }
    await go(page, '/more/settings/sicherheit');
    await expect(page.getByRole('main').getByRole('link', { name: 'Entsperren' })).toBeVisible();
  });
});
