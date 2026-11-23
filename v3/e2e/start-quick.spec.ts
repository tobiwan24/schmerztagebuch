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
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

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
});
