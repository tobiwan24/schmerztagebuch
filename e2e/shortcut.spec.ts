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
    await expect(page.getByTestId('intake-keys')).toHaveCount(0);
    // mit Bestätigung → Schlüssel aktiv, Zugangsdaten kopierbar
    await card.getByRole('button', { name: 'Kurzbefehl einrichten' }).click();
    await page.getByLabel('Ich habe verstanden').check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByTestId('intake-keys').locator('li')).toHaveCount(1);
    await expect(card).toContainText('/api/v1/intake/');
    await expect(card.getByRole('button', { name: 'Zugangsdaten kopieren' })).toBeVisible();
  });

  test('VOI-23: geführte Einrichtung — Hinweis nennt die Vorlagen, Zugangsdaten kopierbar, Manifest abrufbar, Testschritt zeigt „Angekommen“', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('voi23'));
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Kurzbefehl (Siri)' }).click();
    const card = page.getByTestId('intake-card');
    // vor der Einrichtung nur Schritt 1
    await expect(card.getByTestId('intake-step-1')).toBeVisible();
    await expect(card.getByTestId('intake-step-3')).toHaveCount(0);
    await card.getByRole('button', { name: 'Kurzbefehl einrichten' }).click();
    await expect(page.getByRole('dialog')).toContainText('Die Vorlagen (Titel, Feldnamen, Optionen, Medikamentennamen) werden beim Abruf kurz unverschlüsselt auf dem Server gelesen');
    await page.getByLabel('Ich habe verstanden').check();
    await page.getByRole('button', { name: 'Einrichten', exact: true }).click();
    // Schritt 2: ohne iCloud-Link kein Download-Knopf, Selbstbau-Anleitung aufklappbar
    await expect(card.getByTestId('intake-step-2')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Kurzbefehl laden' })).toHaveCount(0);
    await expect(card.getByText('Kurzbefehle-App → neuer Kurzbefehl')).toBeHidden();
    await card.getByRole('button', { name: 'Selbst bauen (Anleitung)' }).click();
    await expect(card.getByText('Kurzbefehle-App → neuer Kurzbefehl')).toBeVisible();
    // Schritt 3: Zugangsdaten (Adresse + Token) in einem Zug kopieren
    await card.getByRole('button', { name: 'Zugangsdaten kopieren' }).click();
    await expect(card.getByRole('button', { name: 'Kopiert' })).toBeVisible();
    const conn = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { url: string; token: string };
    expect(conn.url).toContain('/api/v1/intake/');
    expect(conn.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const auth = { authorization: `Bearer ${conn.token}` };
    // das Manifest ist sofort abrufbar und enthält die Vorlage des Tagebuchs
    await expect.poll(async () => (await page.request.get(`${conn.url}/manifest`, { headers: auth })).status()).toBe(200);
    const manifest = (await (await page.request.get(`${conn.url}/manifest`, { headers: auth })).json()) as { templates: { name: string }[] };
    expect(manifest.templates.map((t) => t.name)).toContain('Allgemeines Schmerz-Tagebuch');
    expect((await page.request.get(`${conn.url}/manifest`, { headers: { authorization: 'Bearer falsch' } })).status()).toBe(401);
    // Schritt 4: noch nichts angekommen → Eintrag senden → angekommen
    await card.getByRole('button', { name: 'Prüfen' }).click();
    await expect(card.getByTestId('intake-arrival')).toHaveText('Noch nichts angekommen');
    const sent = await page.request.post(conn.url, { headers: auth, data: { values: { Schmerzstärke: 5 }, text: 'STB-E2E-MARKER Manifest' } });
    expect(sent.status()).toBe(202);
    await card.getByRole('button', { name: 'Prüfen' }).click();
    await expect(card.getByTestId('intake-arrival')).toContainText('Angekommen ✓ (');
  });
});
