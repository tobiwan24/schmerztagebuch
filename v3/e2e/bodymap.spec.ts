import { fileURLToPath } from 'node:url';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const field = (page: Page) => page.getByTestId('block-field').filter({ hasText: 'Schmerzlokalisation' });

async function tapAt(canvas: Locator, fx: number, fy: number) {
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
}

async function strokeAcross(page: Page, canvas: Locator, from: [number, number], to: [number, number]) {
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 12 });
  await page.mouse.up();
}

test.describe('Body-Map', () => {
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
  });

  test('BLK-03: neuer Eintrag zeigt das defaultPresetId-Bild bereits ausgewählt; Punkt setzen und speichern', async ({ page }) => {
    const f = field(page);
    await expect(f.getByRole('button', { name: 'Körper Vorderseite' })).toHaveAttribute('aria-pressed', 'true');
    const img = f.getByRole('img', { name: 'Körper Vorderseite' });
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    await f.getByLabel('Intensität').fill('8');
    await tapAt(f.getByTestId('bodymap-canvas'), 0.5, 0.3);
    await expect(f.getByTestId('bodymap-points')).toContainText('#1 · Punkt · Intensität 8');

    // Bildwechsel mit Markierung nur nach Rückfrage (Spec 05, A-024)
    await f.getByRole('button', { name: 'Körper Rückseite' }).click();
    await expect(page.getByRole('dialog')).toContainText('Bild wechseln?');
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(f.getByRole('button', { name: 'Körper Vorderseite' })).toHaveAttribute('aria-pressed', 'true');
    await expect(f.getByTestId('bodymap-mark')).toHaveCount(1);

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Schmerzlokalisation' })).toContainText('1 Punkt');
  });

  test('BLK-20: Punkt- und Pinsel-Markierungen mit Größe, Intensität und Kommentar bleiben erhalten; Entfernen nummeriert neu', async ({ page }) => {
    const f = field(page);
    const canvas = f.getByTestId('bodymap-canvas');

    // #1 kleiner Punkt, Intensität 2, mit Kommentar
    await f.getByRole('button', { name: 'Klein' }).click();
    await f.getByLabel('Intensität').fill('2');
    await tapAt(canvas, 0.3, 0.2);
    await f.getByLabel('Kommentar zu Markierung 1').fill('dumpf');

    // #2 großer Pinselstrich, Intensität 9
    await f.getByRole('button', { name: 'Pinsel', exact: true }).click();
    await f.getByRole('button', { name: 'Groß' }).click();
    await f.getByLabel('Intensität').fill('9');
    await strokeAcross(page, canvas, [0.4, 0.5], [0.6, 0.7]);
    await f.getByLabel('Kommentar zu Markierung 2').fill('brennend');

    // #3 mittlerer Punkt (wird wieder entfernt → Neunummerierung)
    await f.getByRole('button', { name: 'Punkt', exact: true }).click();
    await f.getByRole('button', { name: 'Mittel' }).click();
    await tapAt(canvas, 0.7, 0.2);
    await expect(f.getByTestId('bodymap-mark')).toHaveCount(3);
    await f.getByRole('button', { name: 'Markierung 1 entfernen' }).click();
    const marks = f.getByTestId('bodymap-mark');
    await expect(marks).toHaveCount(2);
    await expect(marks.nth(0)).toContainText('#1 · Pinsel · Intensität 9');
    await expect(marks.nth(1)).toContainText('#2 · Punkt · Intensität 9');
    await expect(f.getByLabel('Kommentar zu Markierung 1')).toHaveValue('brennend');

    // Form im Bild: Pinsel als Linie mit Breite „groß", Punkt als Kreis
    const shapes = canvas.locator('svg g[data-mark-kind]');
    await expect(shapes).toHaveCount(2);
    await expect(shapes.nth(0)).toHaveAttribute('data-mark-kind', 'brush');
    await expect(shapes.nth(1)).toHaveAttribute('data-mark-kind', 'point');
    const before = await canvas.locator('svg').innerHTML();

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Schmerzlokalisation' })).toContainText('2 Punkte');

    // Wieder öffnen: gleiche Markierungen an derselben Stelle, Kommentare erhalten
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    const g = field(page);
    await expect(g.getByTestId('bodymap-mark')).toHaveCount(2);
    await expect(g.getByLabel('Kommentar zu Markierung 1')).toHaveValue('brennend');
    await expect(g.getByTestId('bodymap-mark').nth(0)).toContainText('#1 · Pinsel · Intensität 9');
    await expect(g.getByTestId('bodymap-canvas').locator('svg')).toBeVisible();
    expect(await g.getByTestId('bodymap-canvas').locator('svg').innerHTML()).toBe(before);
  });

  test('eigenes Bild lokal hochladen und zuschneiden (auch WebKit/Safari)', async ({ page }) => {
    const f = field(page);
    await f.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('../apps/web/src/assets/bodymap/fuss-plantar.png', import.meta.url)));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Bild zuschneiden');
    await dialog.getByRole('button', { name: '4:3' }).click();
    await dialog.getByLabel('Zoom').fill('1.5');
    await dialog.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(f.getByRole('button', { name: 'Eigenes Bild 1' })).toHaveAttribute('aria-pressed', 'true');
    const dims = await f.getByTestId('bodymap-canvas').locator('img').evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
    expect(Math.abs(dims.w / dims.h - 4 / 3)).toBeLessThan(0.02);
  });
});

