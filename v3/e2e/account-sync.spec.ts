// Einstellungen → Konto & Sync (UI-20): „Jetzt synchronisieren", Wechsel zurück auf „nur dieses Gerät" (SYN-12-Sperre,
// danach keinerlei Server-Requests wie SYN-10).
import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

async function quickEntry(page: Page) {
  await go(page, '/');
  await page.getByRole('link', { name: 'Schnell eintragen' }).click();
  const slider = page.getByLabel(/Schmerzstärke/);
  const box = (await slider.boundingBox())!;
  await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
}

test.describe('Konto & Sync', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('ui20'));
  });

  test('UI-20: „Jetzt synchronisieren" startet einen Lauf; Wechsel auf „nur dieses Gerät" ist bei offener Outbox gesperrt, danach gehen keine Requests mehr an den Server', async ({ page }) => {
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
    const pulls: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/v1/sync/pull') pulls.push(r.url());
    });
    await go(page, '/more/settings');
    await page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
    await expect.poll(() => pulls.length).toBeGreaterThan(0);

    // Push scheitert → Änderung bleibt in der Outbox → Wechsel gesperrt (Hinweis)
    await page.route('**/api/v1/sync/push', (route) => route.abort());
    await quickEntry(page);
    await go(page, '/more/settings');
    await page.getByRole('button', { name: 'Nur auf diesem Gerät weiterverwenden' }).click();
    await page.getByRole('button', { name: 'Jetzt zurückstellen' }).click();
    await expect(page.getByTestId('detach-blocked')).toContainText('nicht synchronisiert');
    await expect(page.getByTestId('account-detached')).toHaveCount(0);

    // Push wieder erlaubt, Sync läuft durch, Wechsel gelingt
    await page.unroute('**/api/v1/sync/push');
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
    await go(page, '/more');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
    await go(page, '/more/settings');
    await page.getByRole('button', { name: 'Nur auf diesem Gerät weiterverwenden' }).click();
    await page.getByRole('button', { name: 'Jetzt zurückstellen' }).click();
    await expect(page.getByTestId('account-detached')).toBeVisible({ timeout: 20_000 });
    // RDM-028 P7: auch abgekoppelt bleibt „Backup-Code erneuern“ erreichbar
    await expect(page.getByTestId('account-card').getByRole('button', { name: 'Backup-Code erneuern' })).toBeVisible();

    // ab hier: keinerlei Request an /api/
    const api: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) api.push(r.url());
    });
    await quickEntry(page);
    for (const path of ['/history', '/analysis', '/more', '/more/settings', '/']) await go(page, path);
    await page.waitForTimeout(1000);
    expect(api).toEqual([]);
  });
});
