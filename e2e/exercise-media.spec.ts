// BLK-56 (RDM-033, A-149): Übungsmedien — Bild je Schritt und eigenes Video im Editor hochladen, zu große Videos abgelehnt;
// im Trainingsdurchgang Video (Quelle `blob:`) und Schritt-Ansicht mit Bild und Vor/Zurück.
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

const IMAGE = fileURLToPath(new URL('../apps/web/src/assets/bodymap/fuss-plantar.png', import.meta.url));
// Nur der Datei-Weg wird geprüft (Typ, Größe, Speichern, Object-URL), nicht das Dekodieren.
const VIDEO = { name: 'brücke.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]) };

test.describe('Übungsmedien', () => {
  test.describe.configure({ timeout: 120_000 });

  test('BLK-56: Schrittbild und Video hochladen, zu großes Video abgelehnt; Training zeigt Video und Schritt-Ansicht', async ({ page }) => {
    await onboardWithPassword(page);

    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Medientraining');
    await page.getByLabel('Trainingsvorlage').check();
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Übung', exact: true }).click();
    const card = page.getByRole('region', { name: /^Feld 1:/ });
    await card.getByLabel('Bezeichnung', { exact: true }).fill('Brücke');
    for (const [i, text] of ['Auf den Rücken legen', 'Becken heben'].entries()) {
      await card.getByRole('button', { name: 'Schritt hinzufügen' }).click();
      await card.getByLabel(`Schritt ${i + 1}`, { exact: true }).fill(text);
    }

    // Bild zu Schritt 2
    const chooser = page.waitForEvent('filechooser');
    await card.getByRole('button', { name: 'Bild zu Schritt 2 hinzufügen' }).click();
    await (await chooser).setFiles(IMAGE);
    await expect(card.getByRole('img', { name: 'Bild zu Schritt 2' })).toHaveAttribute('src', /^blob:/);
    await expect(card.getByRole('button', { name: 'Bild von Schritt 2 entfernen' })).toBeVisible();

    // Zu großes Video → klare Meldung, nichts übernommen
    await card.getByLabel('Video auswählen').setInputFiles({ name: 'lang.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await expect(card.getByTestId('exercise-media-error')).toContainText('höchstens 20 MB');
    await expect(card.getByTestId('exercise-video-edit')).toHaveCount(0);
    // Falscher Typ
    await card.getByLabel('Video auswählen').setInputFiles({ name: 'film.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from([1, 2, 3]) });
    await expect(card.getByTestId('exercise-media-error')).toContainText('MP4, WebM oder MOV');
    // Gültiges Video
    await card.getByLabel('Video auswählen').setInputFiles(VIDEO);
    await expect(card.getByTestId('exercise-media-error')).toHaveCount(0);
    await expect(card.getByTestId('exercise-video-edit')).toContainText('brücke.mp4');

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    // Neu laden: Medien kommen aus dem lokalen Speicher
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible({ timeout: 30_000 });
    await go(page, '/training');
    await page.getByTestId('training-template').filter({ hasText: 'Medientraining' }).click();
    await expect(page.getByTestId('training-step-title')).toHaveText('Brücke');
    await expect(page.getByTestId('exercise-video')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByTestId('exercise-video')).toHaveAttribute('controls', '');

    const viewer = page.getByTestId('exercise-step-viewer');
    await expect(viewer.getByTestId('exercise-step-count')).toHaveText('Schritt 1 von 2');
    await expect(viewer.getByTestId('exercise-step-text')).toHaveText('Auf den Rücken legen');
    await expect(viewer.getByRole('button', { name: 'Vorheriger Schritt' })).toBeDisabled();
    await viewer.getByRole('button', { name: 'Nächster Schritt' }).click();
    await expect(viewer.getByTestId('exercise-step-count')).toHaveText('Schritt 2 von 2');
    await expect(viewer.getByTestId('exercise-step-text')).toHaveText('Becken heben');
    await expect(viewer.getByTestId('exercise-step-image')).toHaveAttribute('src', /^blob:/);
    await expect(viewer.getByRole('button', { name: 'Nächster Schritt' })).toBeDisabled();

    // Editor zeigt das gespeicherte Video
    await go(page, '/more/templates');
    await page.getByRole('link', { name: /Medientraining/ }).first().click();
    await expect(page.getByRole('region', { name: /^Feld 1:/ }).getByTestId('exercise-video-edit')).toContainText('Gespeichertes Video');
  });
});
