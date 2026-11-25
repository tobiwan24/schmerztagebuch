import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Start: Schnell-Buttons je Vorlage', () => {
  test.describe.configure({ timeout: 90_000 });

  test('RDM-028 P2: Start zeigt keine Eintragsliste und keinen „Neuer Eintrag“-Knopf', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/quick');
    await page.getByLabel(/Schmerzstärke/).fill('4');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Schnell eintragen' })).toBeVisible();
    await expect(page.getByTestId('template-tile').first()).toBeVisible();
    await expect(page.getByTestId('entry-row')).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Neuer Eintrag' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Weitere laden' })).toHaveCount(0);
  });

  test('RDM-028 P2: ausgewählte Vorlagen bekommen je einen Schnell-Button', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Zweite');
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Slider', exact: true }).click();
    await page.getByRole('region', { name: /^Feld 1:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Stimmung');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    const settings = async (names: string[], on: boolean) => {
      await go(page, '/more/diaries');
      await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
      for (const n of names) {
        const box = page.getByLabel(n, { exact: true });
        if (on) await box.check();
        else await box.uncheck();
      }
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByText('Gespeichert.')).toBeVisible();
    };

    await settings(['Allgemeines Schmerz-Tagebuch', 'Zweite'], true);
    await go(page, '/');
    await expect(page.getByRole('link', { name: 'Schnell: Allgemeines Schmerz-Tagebuch' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Schnell: Zweite' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Schnell eintragen' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Schnell: Zweite' }).click();
    await expect(page.getByTestId('quick-template-choice').getByRole('button', { name: 'Zweite' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Stimmung/)).toBeVisible();

    await settings(['Allgemeines Schmerz-Tagebuch', 'Zweite'], false);
    await go(page, '/');
    await expect(page.getByRole('link', { name: 'Schnell eintragen' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /^Schnell: / })).toHaveCount(0);
  });

  test('RDM-028 P2: ein Schnell-Button ohne Carousel und Punkte', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/');
    await expect(page.getByRole('link', { name: 'Schnell eintragen' })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Schnell-Buttons' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Zu Position/ })).toHaveCount(0);
  });

  test('RDM-028 P2: mehrere Schnell-Buttons als Carousel mit Peek und Punkten', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await onboardWithPassword(page);
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Zweite');
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Slider', exact: true }).click();
    await page.getByRole('region', { name: /^Feld 1:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Stimmung');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await page.getByLabel('Allgemeines Schmerz-Tagebuch', { exact: true }).check();
    await page.getByLabel('Zweite', { exact: true }).check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();
    await go(page, '/');

    const carousel = page.getByRole('region', { name: 'Schnell-Buttons' });
    const first = carousel.getByRole('link', { name: 'Schnell: Allgemeines Schmerz-Tagebuch' });
    const second = carousel.getByRole('link', { name: 'Schnell: Zweite' });
    await expect(first).toBeVisible();
    const vw = 375;
    const b1 = (await first.boundingBox())!;
    expect(await first.evaluate((el) => el.scrollWidth <= el.clientWidth), 'RDM-028 P2: langes Label läuft nicht über').toBe(true);
    expect(b1.width / vw).toBeGreaterThan(0.75);
    expect(b1.width / vw).toBeLessThan(0.9);
    const b2 = (await second.boundingBox())!;
    expect(b2.x).toBeLessThan(vw - 8); // Peek: zweiter Button lugt rechts hervor
    expect(b2.x + b2.width).toBeGreaterThan(vw); // ... ist aber nicht ganz im Bild
    const dots = page.getByRole('button', { name: /^Zu Position/ });
    await expect(dots).toHaveCount(2);
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    for (let i = 0; i < 2; i++) {
      const b = (await dots.nth(i).boundingBox())!;
      expect(b.width, 'RDM-028 P2: Punkte sind mindestens 44 px groß').toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    // Fokus-Ring des ersten Knopfes wird nicht vom Viewport abgeschnitten: Platz um den Knopf im Viewport.
    const viewport = (await carousel.locator('[data-slot="carousel-content"]').boundingBox())!;
    expect(b1.x - viewport.x).toBeGreaterThanOrEqual(4);
    expect(b1.y - viewport.y).toBeGreaterThanOrEqual(4);

    await dots.nth(1).click();
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect
      .poll(async () => {
        const b = (await second.boundingBox())!;
        return b.x + b.width <= vw + 1;
      })
      .toBe(true);

    await second.click();
    await expect(page.getByTestId('quick-template-choice').getByRole('button', { name: 'Zweite' })).toHaveAttribute('aria-pressed', 'true');
  });
});
