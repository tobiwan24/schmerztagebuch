import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

/** Mehr → Tagebücher → „Tagebuch anlegen" bis zur Liste; danach Eintrag im neuen Tagebuch und Verlauf „Alle". */
async function createDiaryAndUseIt(page: Page) {
  await go(page, '/more/diaries');
  await expect(page.getByTestId('diary-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Tagebuch anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Tagebuch anlegen' })).toBeVisible();

  // Leerer Name wird abgelehnt
  await page.getByLabel('Name').fill(' ');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Bitte gib dem Tagebuch einen Namen.')).toBeVisible();

  await page.getByLabel('Name').fill('Katzentagebuch');
  await page.getByRole('button', { name: 'Tier' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /Migräne-Tracking/ }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();

  await expect(page.getByTestId('diary-card')).toHaveCount(2);
  await expect(page.getByTestId('diary-card').nth(1)).toContainText('Katzentagebuch');

  // Eintragsformular bietet die Vorlage des neuen Tagebuchs an, sobald es gewählt ist (RDM-034)
  await go(page, '/');
  await page.getByLabel('Tagebuch', { exact: true }).selectOption({ label: 'Katzentagebuch' });
  await go(page, '/entry/new');
  await expect(page.getByText('Begleitsymptome', { exact: true })).toBeVisible();
  await page.getByLabel(/Schmerzstärke/).fill('6');
  await page.getByLabel('Notizen').fill('Katzenzeichen');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();

  // Verlauf „Alle" zeigt den Eintrag des neuen Tagebuchs
  await go(page, '/history');
  await page.getByLabel('Suchen').fill('Katzenzeichen');
  await expect(page.getByTestId('entry-row')).toHaveCount(1);
}

test.describe('Tagebuch anlegen', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-15: Tagebuch anlegen im Modus local-only; erscheint in Liste, Eintragsformular und Verlauf', async ({ page }) => {
    await onboardWithPassword(page);
    await createDiaryAndUseIt(page);
  });

  test('UI-15: Tagebuch anlegen mit Konto legt den Tagebuch-Schlüssel auf dem Server an', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('dia'));
    await createDiaryAndUseIt(page);
    const res = await page.request.get('/api/v1/diaries');
    const diaries = (await res.json()) as { role: string; keyEpoch: number; wrappedDk: string }[];
    expect(diaries).toHaveLength(2);
    expect(diaries.every((d) => d.role === 'owner' && d.keyEpoch === 1 && d.wrappedDk.length > 0)).toBe(true);
  });
});
