import { test, expect } from '@playwright/test';
import { onboardWithPassword, swReady } from './helpers';

test.describe('Service Worker', () => {
  test('SYN-15: App-Shell lädt offline', async ({ page, context }) => {
    await onboardWithPassword(page);
    await swReady(page);
    await context.setOffline(true);
    await page.reload();
    // Nach Neuladen ist die App korrekt gesperrt (Spec 03) — die Shell kommt aber aus dem Cache.
    await expect(page.getByTestId('lock-banner')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    await context.setOffline(false);
  });
});
