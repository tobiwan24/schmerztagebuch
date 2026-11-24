import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

test.describe.configure({ timeout: 120_000 });

function card(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }) });
}

async function top(page: Page, title: string): Promise<number> {
  const box = await card(page, title).boundingBox();
  expect(box, title).not.toBeNull();
  return box!.y;
}

test.describe('Reihenfolge der Einstellungen', () => {
  test('RDM-028 P7: Reihenfolge der Einstellungen und Backup-Code am Ende von Konto & Sync (Konto)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('order'));
    await go(page, '/more/settings');
    const account = page.getByTestId('account-card');
    await expect(account).toBeVisible();
    const [a, u, s, l] = [await top(page, 'Konto & Sync'), await top(page, 'Updates'), await top(page, 'Sicherheit'), await top(page, 'Sperre')];
    expect(a).toBeLessThan(u);
    expect(u).toBeLessThan(s);
    expect(s).toBeLessThan(l);
    const renew = account.getByRole('button', { name: 'Backup-Code erneuern' });
    await expect(renew).toBeVisible();
    const sync = await account.getByRole('button', { name: 'Jetzt synchronisieren' }).boundingBox();
    expect((await renew.boundingBox())!.y).toBeGreaterThan(sync!.y);
    const security = card(page, 'Sicherheit');
    await expect(security.getByRole('button')).toHaveCount(1);
    await expect(security.getByRole('button', { name: 'Jetzt sperren' })).toBeVisible();
    await expect(security.getByRole('button', { name: 'Backup-Code erneuern' })).toHaveCount(0);
  });

  test('RDM-028 P7: Reihenfolge der Einstellungen und Backup-Code am Ende von Konto & Sync (nur dieses Gerät)', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/settings');
    const account = card(page, 'Konto & Sync');
    await expect(account.getByRole('button', { name: 'Backup-Code erneuern' })).toBeVisible();
    await expect(account.getByTestId('factors')).toBeVisible();
    const [a, u, s, l] = [await top(page, 'Konto & Sync'), await top(page, 'Updates'), await top(page, 'Sicherheit'), await top(page, 'Sperre')];
    expect(a).toBeLessThan(u);
    expect(u).toBeLessThan(s);
    expect(s).toBeLessThan(l);
    const security = card(page, 'Sicherheit');
    await expect(security.getByRole('button')).toHaveCount(1);
    await expect(security.getByRole('button', { name: 'Jetzt sperren' })).toBeVisible();
  });
});
