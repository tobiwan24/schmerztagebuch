import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { addDeviceWithBackupCode, addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

const UPLOAD = fileURLToPath(new URL('../apps/web/src/assets/bodymap/fuss-dorsal.png', import.meta.url));
const field = (page: Page) => page.getByTestId('block-field').filter({ hasText: 'Schmerzlokalisation' });
const imageSize = (page: Page) =>
  field(page).getByTestId('bodymap-canvas').locator('img').evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight, src: el.src.slice(0, 22) }));

test.describe('Eigene Body-Map-Bilder', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto + Zweitgerät mit virtuellem Authenticator (Chromium)');
  });

  test('BLK-21: eigenes Bild hochladen und zuschneiden, als Standard setzen → neuer Eintrag zeigt es vorausgewählt; Zweitgerät hat es', async ({ page: a, browser }) => {
    await addVirtualAuthenticator(a);
    const user = uniqueUser('blk21');
    const code = await onboardWithCloud(a, user);
    await go(a, '/entry/new');
    const f = field(a);

    // hochladen → Zuschnitt 1:1 → Name
    await f.locator('input[type=file]').setInputFiles(UPLOAD);
    const dialog = a.getByRole('dialog');
    await expect(dialog).toContainText('Bild zuschneiden');
    await dialog.getByRole('button', { name: '1:1' }).click();
    await dialog.getByLabel('Name des Bildes').fill('Fuß rechts oben');
    await dialog.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(a.getByRole('dialog')).toHaveCount(0);
    await expect(f.getByRole('button', { name: 'Fuß rechts oben' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await imageSize(a)).src).toBe('data:image/jpeg;base64');
    const size = await imageSize(a);
    expect(size.w).toBe(size.h); // 1:1 zugeschnitten
    expect(size.w).toBeLessThanOrEqual(1000);

    // als Standard für dieses Feld, Markierung setzen, speichern
    await f.getByRole('button', { name: 'Als Standard für dieses Feld' }).click();
    await expect(f.getByRole('status')).toContainText('Neue Einträge zeigen dieses Bild vorausgewählt');
    const box = (await f.getByTestId('bodymap-canvas').boundingBox())!;
    await f.getByTestId('bodymap-canvas').click({ position: { x: box.width / 2, y: box.height / 2 } });
    await a.getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByTestId('entry-field').filter({ hasText: 'Schmerzlokalisation' })).toContainText('1 Punkt');

    // neuer Eintrag: eigenes Bild vorausgewählt
    await go(a, '/entry/new');
    await expect(field(a).getByRole('button', { name: 'Fuß rechts oben' })).toHaveAttribute('aria-pressed', 'true');
    expect((await imageSize(a)).src).toBe('data:image/jpeg;base64');
    await expect(a.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });

    // Zweitgerät: Bild verfügbar und als Standard vorausgewählt; gespeicherter Eintrag zeigt es
    const b = await addDeviceWithBackupCode(browser, user, code);
    await go(b, '/entry/new');
    await expect(field(b).getByRole('button', { name: 'Fuß rechts oben' })).toHaveAttribute('aria-pressed', 'true');
    const sizeB = await imageSize(b);
    expect(sizeB).toEqual(size);
    await b.context().close();

    // eigenes Bild löschen (nach Rückfrage) → verschwindet aus der Auswahl
    await field(a).getByRole('button', { name: 'Bild löschen' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Bild löschen' }).click();
    await expect(field(a).getByRole('button', { name: 'Fuß rechts oben' })).toHaveCount(0);
  });
});
