import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

async function addEntry(page: Page, when: string, pain: string) {
  await go(page, '/entry/new');
  await page.getByLabel('Zeitpunkt', { exact: true }).fill(when);
  await page.getByLabel(/Schmerzstärke/).fill(pain);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

test.describe('Auswertung: Zeiträume Tag und 6 Monate', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ANA-17: „Tag“ zeigt Einzelwerte ohne Aggregation, „6 M“ reicht weiter zurück als 90 T; Vor/Zurück verschiebt um die Zeitraumlänge', async ({ page }) => {
    await onboardWithPassword(page);
    const day = (offset: number) =>
      page.evaluate((o) => {
        const d = new Date();
        d.setDate(d.getDate() - o);
        return d.toLocaleDateString('en-CA');
      }, offset);
    const today = await day(0);
    await addEntry(page, `${today}T06:30`, '3');
    await addEntry(page, `${today}T12:00`, '5');
    await addEntry(page, `${today}T18:45`, '7');
    await addEntry(page, `${await day(120)}T10:00`, '4');
    await addEntry(page, `${await day(1)}T09:00`, '6');

    await go(page, '/analysis');
    const n = page.getByTestId('trend-n');
    const period = page.getByTestId('analysis-period');
    const ranges = page.getByRole('group', { name: 'Zeitraum' });

    // Tag: drei Einzelwerte desselben Tages (keine Tagesaggregation), Zeitachse in Uhrzeiten
    await ranges.getByRole('button', { name: 'Tag', exact: true }).click();
    await expect(n).toHaveText('n = 3 Werte');
    await expect(page.getByTestId('analysis-view-trend')).toContainText('12:00');
    await expect(period).toHaveText(new RegExp('^[0-9]{2}[.][0-9]{2}[.]' + today.slice(0, 4) + '$'));
    // Zurück: um einen Tag; dort ein Wert
    await page.getByRole('button', { name: 'Früherer Zeitraum' }).click();
    await expect(n).toHaveText('n = 1 Wert');
    await page.getByRole('button', { name: 'Späterer Zeitraum' }).click();
    await expect(n).toHaveText('n = 3 Werte');

    // 90 T: Eintrag vor 120 Tagen nicht dabei (2 Tage mit Wert); 6 M: dabei (3 Tage)
    await ranges.getByRole('button', { name: '90 T', exact: true }).click();
    await expect(n).toHaveText('n = 2 Tage mit Wert');
    await ranges.getByRole('button', { name: '6 M', exact: true }).click();
    await expect(n).toHaveText('n = 3 Tage mit Wert');
    // 6 M zurück: Zeitraum verschiebt sich um 182 Tage, dort nichts
    await page.getByRole('button', { name: 'Früherer Zeitraum' }).click();
    await expect(page.getByText('Für diesen Zeitraum gibt es keine Werte.')).toBeVisible();
  });
});
