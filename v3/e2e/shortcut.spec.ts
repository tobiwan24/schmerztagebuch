import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

test.describe('Kurzbefehl', () => {
  test.describe.configure({ timeout: 90_000 });

  test('VOI-09: Zwischenablage-Weg erzeugt einen Entwurf, der erst nach Bestätigung gespeichert wird (local-only)', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Kurzbefehl (Siri)' }).click();
    await expect(page.getByText('Der Kurzbefehl über den Server braucht ein Konto.')).toBeVisible();
    await page.getByLabel('Inhalt (JSON)').fill(JSON.stringify({ values: { schmerzstaerke: 7 }, text: 'STB-E2E-MARKER Siri' }));
    await page.getByRole('button', { name: 'Entwurf anzeigen' }).click();
    const draft = page.getByTestId('shortcut-draft');
    await expect(draft).toContainText('Entwurf für „Allgemeines Schmerz-Tagebuch"');
    await expect(draft).toContainText('Schmerzstärke: 7');
    await expect(draft).toContainText('STB-E2E-MARKER Siri');
    // noch nichts gespeichert
    await go(page, '/history');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel('Inhalt (JSON)')).toBeVisible();
    await page.getByLabel('Inhalt (JSON)').fill(JSON.stringify({ values: { schmerzstaerke: 7 }, text: 'STB-E2E-MARKER Siri' }));
    await page.getByRole('button', { name: 'Entwurf anzeigen' }).click();
    await page.getByRole('button', { name: 'Als Eintrag speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Notizen' })).toContainText('STB-E2E-MARKER Siri');
    const source = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const open = indexedDB.open('stb-v3');
          open.onsuccess = () => {
            const req = open.result.transaction('records').objectStore('records').getAll();
            req.onsuccess = () => resolve((req.result as { kind: string; payload: string }[]).filter((r) => r.kind === 'entry').map((r) => (JSON.parse(r.payload) as { meta: { source: string } }).meta.source));
          };
        }),
    );
    expect(source).toEqual(['shortcut']);
  });

  test('VOI-09: ungültige Werte verhindern das Speichern und werden genannt', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Kurzbefehl (Siri)' }).click();
    await page.getByLabel('Inhalt (JSON)').fill(JSON.stringify({ values: { schmerzstaerke: 42 } }));
    await page.getByRole('button', { name: 'Entwurf anzeigen' }).click();
    await expect(page.getByTestId('shortcut-draft').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als Eintrag speichern' })).toBeDisabled();
  });

  test('VOI-02: Einrichtung ist ohne Bestätigung des Hinweisdialogs nicht abschließbar', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('voi02'));
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Kurzbefehl (Siri)' }).click();
    const card = page.getByTestId('intake-card');
    await card.getByRole('button', { name: 'Kurzbefehl einrichten' }).click();
    await expect(page.getByRole('heading', { name: 'Ausnahme von der Ende-zu-Ende-Verschlüsselung' })).toBeVisible();
    const confirm = page.getByRole('button', { name: 'Einrichten', exact: true });
    await expect(confirm).toBeDisabled();
    // Abbrechen ohne Bestätigung → kein Schlüssel, kein Token
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByTestId('intake-token')).toHaveCount(0);
    await expect(page.getByTestId('intake-keys')).toHaveCount(0);
    // mit Bestätigung → Token einmalig sichtbar, Schlüssel aktiv
    await card.getByRole('button', { name: 'Kurzbefehl einrichten' }).click();
    await page.getByLabel('Ich habe verstanden').check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByTestId('intake-token')).toContainText('Token');
    await expect(page.getByTestId('intake-keys').locator('li')).toHaveCount(1);
    await expect(card).toContainText('/api/v1/intake/');
  });
});
