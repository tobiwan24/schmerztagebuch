import { test, expect } from '@playwright/test';
import { PASSWORD, go, lockViaSettings, onboardWithPassword } from './helpers';

test.describe('Onboarding: erstes Tagebuch und Vorlage', () => {
  test('legt Tagebuch und gewählte Katalogvorlage an; Vorlage ist danach vorhanden', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Nur auf diesem Gerät/ }).click();
    await page.getByRole('button', { name: 'Mit Passwort' }).click();
    await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill(PASSWORD);
    await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
    await page.getByRole('button', { name: 'Konto anlegen' }).click();
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByLabel('Name').fill('');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByText('Bitte gib dem Tagebuch einen Namen.')).toBeVisible();
    await page.getByLabel('Name').fill('Bello');
    await page.getByRole('button', { name: 'Tier' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Später' }).click();
    await page.getByRole('radio', { name: /Migräne-Tracking/ }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });

    const stored = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const req = indexedDB.open('stb-v3');
          req.onsuccess = () => {
            const all = req.result.transaction('records').objectStore('records').getAll();
            all.onsuccess = () => resolve((all.result as { kind: string }[]).map((r) => r.kind).sort());
          };
        }),
    );
    expect(stored).toEqual(['diary', 'template', 'templateVersion']);
  });

  test('entsperrtes Konto bleibt im Gerüst, sobald ein Tagebuch existiert', async ({ page }) => {
    await onboardWithPassword(page);
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
  });
});
