// Einstellungen → Hinweise (ANA-30, A-089): Regel anlegen; ein erfüllender Eintrag erzeugt ein Start-Banner (und eine
// lokale Notification, wenn erlaubt); innerhalb des Cooldowns nicht erneut.
import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword, swReady } from './helpers';

async function quickEntry(page: Page) {
  await go(page, '/');
  await page.getByRole('link', { name: 'Schnell eintragen' }).click();
  const slider = page.getByLabel(/Schmerzstärke/);
  const box = (await slider.boundingBox())!;
  await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
}

test.describe('Hinweise', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ANA-30: Regel anlegen, erfüllender Eintrag → Banner und Notification, im Cooldown nicht erneut', async ({ page }) => {
    // Berechtigung und Anzeige simulieren (headless gewährt keine echte Berechtigung): `showNotification` wird mitgeschrieben.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      const shown: string[] = [];
      (window as unknown as { __shown: string[] }).__shown = shown;
      ServiceWorkerRegistration.prototype.showNotification = function (title: string) {
        shown.push(title);
        return Promise.resolve();
      };
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await onboardWithPassword(page);

    await go(page, '/more/settings/erinnerungen');
    const card = page.getByTestId('rules-card');
    await expect(card).toContainText('Noch keine Regel angelegt.');
    await card.getByLabel('Feld').selectOption({ label: 'Schmerzstärke' });
    await card.getByLabel('Wert').fill('3');
    await card.getByLabel('An so vielen Tagen in Folge').fill('1');
    await card.getByRole('button', { name: 'Regel anlegen' }).click();
    await expect(card.getByTestId('rule-row')).toHaveCount(1);
    await expect(card.getByTestId('rule-row')).toContainText('Schmerzstärke ≥ 3 an 1 Tag');
    await expect(page.getByTestId('rule-banner')).toHaveCount(0);

    await swReady(page);
    await quickEntry(page);
    const banner = page.getByTestId('rule-banner');
    await expect(banner).toHaveCount(1, { timeout: 15_000 });
    await expect(banner).toContainText('Schmerzstärke ≥ 3 an 1 Tag');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shown: string[] }).__shown)).toEqual(['Hinweis aus deinem Tagebuch']);

    // Banner ausblenden; ein weiterer Eintrag innerhalb des Cooldowns meldet nicht erneut.
    await banner.getByRole('button', { name: 'Ausblenden' }).click();
    await expect(banner).toHaveCount(0);
    await quickEntry(page);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('rule-banner')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __shown: string[] }).__shown)).toHaveLength(1);

    // Regel löschen
    await go(page, '/more/settings/erinnerungen');
    await page.getByTestId('rules-card').getByRole('button', { name: /Regel .* löschen/ }).click();
    await expect(page.getByTestId('rule-row')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
