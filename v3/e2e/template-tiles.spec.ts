import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

test.describe('Start: Vorlagen-Kacheln', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-44: Kacheln aller aktiven Vorlagen in Reihenfolge, Tipp öffnet das Formular mit dieser Vorlage; keine Begrüßung ohne Konto', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/diaries/new');
    await page.getByLabel('Name').fill('Zweitbuch');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('radio', { name: /Migräne-Tracking/ }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByTestId('diary-card')).toHaveCount(2);

    await go(page, '/');
    const tiles = page.getByTestId('template-tile');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.nth(0)).toContainText('Allgemeines Schmerz-Tagebuch');
    await expect(tiles.nth(1)).toContainText('Migräne-Tracking');
    await expect(tiles.nth(1).getByTestId('template-icon')).toBeVisible();
    await expect(page.getByTestId('greeting')).toHaveCount(0);

    await tiles.nth(1).click();
    await expect(page).toHaveURL(/\/entry\/new\?template=/);
    await expect(page.getByRole('button', { name: 'Migräne-Tracking' })).toHaveAttribute('aria-pressed', 'true');

    // Archivierte Vorlage: keine Kachel
    await go(page, '/more/templates');
    await page.getByTestId('template-row').filter({ hasText: 'Allgemeines Schmerz-Tagebuch' }).getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch archivieren' }).click();
    await go(page, '/');
    await expect(page.getByTestId('template-tile')).toHaveCount(1);
  });

  test('BLK-44: im Konto-Modus Begrüßung mit Benutzernamen', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    const user = uniqueUser('tile');
    await onboardWithCloud(page, user);
    await go(page, '/');
    await expect(page.getByTestId('greeting')).toHaveText(`Hallo, ${user}`);
  });
});
