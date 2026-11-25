// SHR-15: Start zeigt „n neue Einträge von X“ seit dem letzten Besuch; Tippen führt zum nach dem Autor gefilterten Verlauf
// (Chromium, zwei Konten mit virtuellem Authenticator).
import { test, expect } from '@playwright/test';
import { addEntry, addVirtualAuthenticator, foreground, go, inviteMember, onboardWithCloud, uniqueUser } from './helpers';

test.describe('Neue Einträge anderer', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'zwei Konten mit virtuellem Authenticator (Chromium)');
  });

  test('SHR-15: Hinweis „2 neue Einträge von X“ auf Start, Tippen → gefilterter Verlauf, danach weg; eigene Einträge zählen nicht', async ({ page: a, browser }) => {
    await addVirtualAuthenticator(a);
    const ownerName = uniqueUser('new-o');
    await onboardWithCloud(a, ownerName);
    const b = await inviteMember(a, browser, uniqueUser('new-m'), 2);

    // Mitglied: Ausgangspunkt setzen, sobald das geteilte Tagebuch angekommen ist (Start ist offen)
    await expect
      .poll(async () => (await foreground(b.page), await go(b.page, '/more/diaries'), b.page.getByTestId('diary-card').count()), { timeout: 45_000, intervals: [1000, 2000] })
      .toBe(2);
    await go(b.page, '/');
    await expect(b.page.getByTestId('new-entries-notice')).toHaveCount(0);

    // Owner schreibt zwei Einträge; der Owner selbst bekommt keinen Hinweis
    await addEntry(a, '4', 'STB-NEU-EINS');
    await addEntry(a, '5', 'STB-NEU-ZWEI');
    await go(a, '/');
    await expect(a.getByTestId('new-entries-notice')).toHaveCount(0);

    // Mitglied: Hinweis mit Anzahl und Benutzername
    await expect
      .poll(async () => (await foreground(b.page), await go(b.page, '/'), b.page.getByTestId('new-entries-notice').count()), { timeout: 60_000, intervals: [1000, 2000] })
      .toBeGreaterThan(0);
    const notice = b.page.getByTestId('new-entries-notice');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText(`2 neue Einträge von ${ownerName}`);

    // Tippen → gefilterter Verlauf (Chip „Von …“), beide Einträge des Owners
    await notice.getByRole('link').click();
    await expect(b.page.getByRole('button', { name: `Von ${ownerName}` })).toBeVisible();
    await expect(b.page.getByTestId('entry-row')).toHaveCount(2);
    // bestätigt: auf Start kein Hinweis mehr
    await go(b.page, '/');
    await expect(b.page.getByTestId('new-entries-notice')).toHaveCount(0);

    // ein weiterer Eintrag → „1 neuer Eintrag“; Ausblenden bestätigt ohne Sprung
    await addEntry(a, '6', 'STB-NEU-DREI');
    await expect
      .poll(async () => (await foreground(b.page), await go(b.page, '/'), b.page.getByTestId('new-entries-notice').count()), { timeout: 60_000, intervals: [1000, 2000] })
      .toBeGreaterThan(0);
    await expect(b.page.getByTestId('new-entries-notice')).toContainText(`1 neuer Eintrag von ${ownerName}`);
    await b.page.getByTestId('new-entries-notice').getByRole('button', { name: 'Ausblenden' }).click();
    await expect(b.page.getByTestId('new-entries-notice')).toHaveCount(0);
    await b.ctx.close();
  });
});
