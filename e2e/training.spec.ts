import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword, openAnalysisView } from './helpers';

async function createTraining(page: Page): Promise<void> {
  await go(page, '/more/templates/new');
  await page.getByLabel('Name', { exact: true }).fill('Rückentraining');
  await page.getByLabel('Trainingsvorlage').check();
  const palette = page.getByRole('group', { name: 'Feld hinzufügen' });
  await palette.getByRole('button', { name: 'Übung', exact: true }).click();
  const first = page.getByRole('region', { name: /^Feld 1:/ });
  await first.getByLabel('Bezeichnung', { exact: true }).fill('Brücke');
  await first.getByLabel('Sätze (optional)').fill('2');
  await first.getByLabel('Wiederholungen (optional)').fill('8');
  await first.getByLabel('Dauer in Sekunden (optional)').fill('30');
  for (const [i, text] of ['Auf den Rücken legen', 'Becken heben'].entries()) {
    await first.getByRole('button', { name: 'Schritt hinzufügen' }).click();
    await first.getByLabel(`Schritt ${i + 1}`, { exact: true }).fill(text);
  }
  await first.getByRole('button', { name: 'Stufe hinzufügen' }).click();
  await first.getByRole('button', { name: 'Stufe hinzufügen' }).click();
  await first.getByLabel('Bezeichnung von Stufe 1').fill('Leicht');
  await first.getByLabel('Bezeichnung von Stufe 2').fill('Schwer');
  await palette.getByRole('button', { name: 'Übung', exact: true }).click();
  await page.getByRole('region', { name: /^Feld 2:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Katzenbuckel');
  await palette.getByRole('button', { name: 'Slider', exact: true }).click();
  await page.getByRole('region', { name: /^Feld 3:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Anstrengung');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
}

test.describe('Training', () => {
  test.describe.configure({ timeout: 120_000 });

  test('UI-30: Kachel „Übungen“, passende Vorlagen, Durchgang mit Timer und Stufe, Speichern ergibt einen Eintrag im Verlauf', async ({ page }) => {
    await onboardWithPassword(page);
    await createTraining(page);

    // Zweite Trainingsvorlage nur für Phase 5 — ohne Phasenangabe nicht passend
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Phase-5-Training');
    await page.getByLabel('Trainingsvorlage').check();
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Übung', exact: true }).click();
    await page.getByRole('region', { name: /^Feld 1:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Klimmzug');
    await page.getByLabel('Funktionsphasen (optional)').fill('5');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    // Start: Kachel „Übungen“, Trainingsvorlagen sind keine Vorlagen-Kacheln
    await go(page, '/');
    await expect(page.getByTestId('template-tile').filter({ hasText: 'Rückentraining' })).toHaveCount(0);
    await page.getByTestId('training-tile').click();
    await expect(page.locator('html')).toHaveAttribute('data-route', '/training');
    await expect(page.getByRole('heading', { name: 'Übungen' })).toBeVisible();
    await expect(page.getByTestId('training-phase')).toContainText('Noch keine Funktionsphase');
    await expect(page.getByTestId('training-template')).toHaveCount(1);
    await expect(page.getByTestId('training-template')).toContainText('Rückentraining');

    // Durchgang: erste Übung
    await page.getByTestId('training-template').click();
    await expect(page.getByTestId('training-step-title')).toHaveText('Brücke');
    await expect(page.getByTestId('training-step-count')).toHaveText('Übung 1 von 2');
    await expect(page.getByTestId('exercise-target')).toHaveText('Ziel: 2 × 8, 30 s');
    await expect(page.getByText('Becken heben')).toBeVisible();
    await page.getByLabel('Stufe', { exact: true }).selectOption({ label: 'Schwer' });

    // Timer mit Start und Pause: zählt in die Dauer
    await expect(page.getByTestId('exercise-timer')).toHaveText('0:00');
    await page.getByRole('button', { name: 'Timer starten' }).click();
    await expect(page.getByRole('button', { name: 'Timer pausieren' })).toBeVisible();
    await expect(page.getByTestId('exercise-timer')).not.toHaveText('0:00', { timeout: 5_000 });
    await page.getByRole('button', { name: 'Timer pausieren' }).click();
    const paused = await page.getByLabel('Dauer (Sekunden)').inputValue();
    expect(Number(paused)).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1_500);
    await expect(page.getByLabel('Dauer (Sekunden)')).toHaveValue(paused);
    await page.getByLabel('Sätze', { exact: true }).fill('2');
    await page.getByLabel('Wiederholungen').fill('8');
    await page.getByLabel('Erledigt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Zweite Übung unberührt, Zurück/Weiter behalten die Werte der ersten
    await expect(page.getByTestId('training-step-title')).toHaveText('Katzenbuckel');
    await page.getByTestId('training-run').getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByLabel('Erledigt')).toBeChecked();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Abschluss: Zusammenfassung und Anstrengung
    await expect(page.getByTestId('training-step-title')).toHaveText('Abschluss');
    await expect(page.getByTestId('training-summary-row').first()).toContainText('erledigt');
    await expect(page.getByTestId('training-summary-row').first()).toContainText('Schwer');
    await page.getByLabel('Anstrengung').fill('6');
    await page.getByRole('button', { name: 'Durchgang speichern' }).click();

    // Normaler Eintrag: Detailansicht und Verlauf
    await expect(page.getByTestId('entry-field').first()).toContainText('Brücke');
    await expect(page.getByTestId('entry-field').first()).toContainText('erledigt');
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
  });

  test('UI-30: ohne Trainingsvorlage ein Leerzustand mit Weg zu den Vorlagen', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/training');
    await expect(page.getByText('Keine passende Trainingsvorlage')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zu den Vorlagen' })).toBeVisible();
  });

  test('ANA-25: Auswertung zeigt „Übungen“ erst mit erledigten Übungen: Wochenbalken und Stufenverlauf', async ({ page }) => {
    await onboardWithPassword(page);
    // Ein normaler Eintrag, damit die Auswertung Daten hat — ohne Training keine Ansicht „Übungen“
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('4');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await go(page, '/analysis');
    await expect(page.getByTestId('analysis-view-trend')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name: 'Übungen' })).toHaveCount(0);

    await createTraining(page);
    await go(page, '/training');
    await page.getByTestId('training-template').click();
    await page.getByLabel('Stufe', { exact: true }).selectOption({ label: 'Schwer' });
    await page.getByLabel('Erledigt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Durchgang speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();

    await go(page, '/analysis');
    await openAnalysisView(page, 'Übungen');
    await expect(page.getByTestId('analysis-view-training')).toBeVisible();
    await expect(page.getByTestId('training-weeks')).toContainText('n = 1 Tag mit erledigten Übungen');
    await expect(page.getByTestId('training-week-list').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId('training-week-list')).toContainText('1 Tag');
    await expect(page.getByTestId('training-levels')).toContainText('Stufe: Brücke');
    await expect(page.getByTestId('training-level-points')).toContainText('Schwer');
    // Die Ansicht „Übungen“ bleibt rein beschreibend: keine Empfehlung
    await expect(page.getByTestId('analysis-view-training')).not.toContainText(/empfehl|solltest/i);
  });

  test('UI-32: zusätzliche Erinnerung „Übungen“ mit eigener Uhrzeit und eigenen Tagen, unabhängig von der Eintrags-Erinnerung', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['notifications']);
    await onboardWithPassword(page);
    await go(page, '/more/settings/erinnerungen');
    const diary = page.getByTestId('reminder-card');
    const training = page.getByTestId('reminder-card-training');
    await expect(training).toContainText('Erinnerung „Übungen“');
    await expect(diary.getByLabel('Erinnerung aktiv', { exact: true })).not.toBeChecked();
    await expect(training.getByLabel('Übungs-Erinnerung aktiv')).not.toBeChecked();
    await expect(training.getByLabel('Uhrzeit')).toHaveValue('18:00');

    await training.getByLabel('Übungs-Erinnerung aktiv').check();
    await training.getByLabel('Uhrzeit').fill('17:15');
    await training.getByRole('button', { name: 'So' }).click();
    // Die Eintrags-Erinnerung bleibt unberührt
    await expect(diary.getByLabel('Erinnerung aktiv', { exact: true })).not.toBeChecked();
    await expect(diary.getByLabel('Uhrzeit')).toHaveValue('20:00');
    await expect(diary.getByRole('button', { name: 'So' })).toHaveAttribute('aria-pressed', 'true');

    await go(page, '/more');
    await go(page, '/more/settings/erinnerungen');
    await expect(training.getByLabel('Übungs-Erinnerung aktiv')).toBeChecked();
    await expect(training.getByLabel('Uhrzeit')).toHaveValue('17:15');
    await expect(training.getByRole('button', { name: 'So' })).toHaveAttribute('aria-pressed', 'false');
    await expect(training.getByRole('button', { name: 'Mo' })).toHaveAttribute('aria-pressed', 'true');
    await expect(diary.getByLabel('Erinnerung aktiv', { exact: true })).not.toBeChecked();
  });
});
