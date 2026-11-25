import { test, expect, type Page } from '@playwright/test';
import { APP_VERSION } from '../apps/web/src/version';
import { go, onboardWithPassword, PASSWORD } from './helpers';

// Die Konfiguration schaltet die Tour für alle Tests ab; diese Datei prüft sie selbst (nur Neuigkeiten-Dialog bleibt aus).
test.use({
  storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'stb-v3-whatsnew', value: APP_VERSION }] }] },
});

const KEY = 'stb-v3-tour';
const tourState = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{"done":[],"skipAll":false}') as { done: string[]; skipAll: boolean }, KEY);
const card = (page: Page) => page.getByTestId('tour-card');

/** Nach `page.reload()` ist die App gesperrt: über den Hinweis entsperren, danach zurück auf die Startseite. */
async function unlockAfterReload(page: Page) {
  await page.getByRole('main').getByRole('link', { name: 'Entsperren' }).click();
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('lock-banner')).toHaveCount(0);
}

test.describe('Tutorial (Tour)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('UI-29: Start zeigt die Tour mit hervorgehobenem Ziel; Weiter bis Fertig, nach Reload nicht wieder', async ({ page }) => {
    await onboardWithPassword(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('Schritt 1 von 3');
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'start-quick');
    await card(page).getByRole('button', { name: 'Weiter' }).click();
    await expect(card(page)).toContainText('Deine Vorlagen');
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'start-tiles');
    await card(page).getByRole('button', { name: 'Weiter' }).click();
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'nav');
    await card(page).getByRole('button', { name: 'Fertig' }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('[data-tour-active]')).toHaveCount(0);
    expect((await tourState(page)).done).toEqual(['start']);

    await page.reload();
    await unlockAfterReload(page);
    await expect(card(page)).toHaveCount(0);
  });

  test('UI-29: nur per Tastatur — Fokus auf „Weiter“, Enter geht weiter, Escape überspringt die Seite', async ({ page }) => {
    await onboardWithPassword(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole('button', { name: 'Weiter' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card(page)).toContainText('Schritt 2 von 3');
    await expect(card(page).getByRole('button', { name: 'Weiter' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    expect((await tourState(page)).done).toEqual(['start']);
  });

  test('UI-29: Überspringen gilt je Seite, „Alle überspringen“ für alle; beides bleibt gespeichert', async ({ page }) => {
    await onboardWithPassword(page);
    await card(page).getByRole('button', { name: 'Überspringen', exact: true }).click();
    await go(page, '/history');
    await expect(card(page)).toContainText('Filtern und sortieren');
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'history-filters');
    await card(page).getByRole('button', { name: 'Überspringen', exact: true }).click();
    await expect(card(page)).toHaveCount(0);
    expect((await tourState(page)).done).toEqual(['start', 'history']);

    await go(page, '/more/templates/new');
    await expect(card(page)).toContainText('Bausteine');
    await card(page).getByRole('button', { name: 'Alle überspringen' }).click();
    await expect(card(page)).toHaveCount(0);
    expect((await tourState(page)).skipAll).toBe(true);
    await go(page, '/entry/new');
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });

  test('UI-29: Eintrag und Auswertung zeigen die Tour; „Tutorial erneut zeigen“ setzt zurück', async ({ page }) => {
    await onboardWithPassword(page);
    await card(page).getByRole('button', { name: 'Überspringen', exact: true }).click();
    await go(page, '/entry/new');
    await expect(card(page)).toContainText('Schritt 1 von 2');
    await expect(card(page)).toContainText('Formular ausfüllen');
    await card(page).getByRole('button', { name: 'Weiter' }).click();
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'entry-save');
    await card(page).getByRole('button', { name: 'Fertig' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page).not.toHaveURL(/\/entry\/new/);

    await go(page, '/analysis');
    await expect(card(page)).toContainText('Zeitraum wählen');
    await card(page).getByRole('button', { name: 'Weiter' }).click();
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'analysis-charts');
    await card(page).getByRole('button', { name: 'Alle überspringen' }).click();

    await go(page, '/more/settings/darstellung');
    await page.getByRole('button', { name: 'Tutorial erneut zeigen' }).click();
    await expect(page.getByTestId('tour-restarted')).toBeVisible();
    expect(await tourState(page)).toEqual({ done: [], skipAll: false });
    await go(page, '/');
    await expect(card(page)).toContainText('Schritt 1 von 3');
  });
});
