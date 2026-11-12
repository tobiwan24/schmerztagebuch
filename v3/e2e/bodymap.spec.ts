import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Body-Map', () => {
  test('BLK-03: neuer Eintrag zeigt das defaultPresetId-Bild bereits ausgewählt; Punkt setzen und speichern', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    const field = page.getByTestId('block-field').filter({ hasText: 'Schmerzlokalisation' });
    await expect(field.getByRole('button', { name: 'Körper Vorderseite' })).toHaveAttribute('aria-pressed', 'true');
    const img = field.getByRole('img', { name: 'Körper Vorderseite' });
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    // Punkt mit Intensität 8 setzen; Bildwechsel ist dann gesperrt
    await field.getByLabel('Intensität').fill('8');
    const canvas = field.getByTestId('bodymap-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
    await expect(field.getByTestId('bodymap-points')).toContainText('Punkt 1 · Intensität 8');
    await expect(field.getByRole('button', { name: 'Körper Rückseite' })).toBeDisabled();

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Schmerzlokalisation' })).toContainText('1 Punkt');

    // Bearbeiten zeigt den gespeicherten Punkt an derselben Stelle (normalisierte Koordinaten)
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByTestId('bodymap-points')).toContainText('Punkt 1 · Intensität 8');
    const circle = page.getByTestId('bodymap-canvas').locator('circle');
    await expect(circle).toHaveCount(1);
  });
});
